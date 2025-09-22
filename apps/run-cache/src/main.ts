import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Storage } from '@google-cloud/storage';

export async function run() {
  try {
    const runCommand = core.getInput("run", { required: true });
    const shell = core.getInput("shell", { required: false }) || 'bash';
    const workingDirectory = core.getInput("working-directory", { required: false }) || '.';
    const cachePath = core.getInput("cache-path", { required: true });
    const includeStdout = core.getInput("include-stdout", { required: false }).toLowerCase() === 'true';

    // Check if GOOGLE_APPLICATION_CREDENTIALS is set
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      core.warning("GOOGLE_APPLICATION_CREDENTIALS not set, running without cache");
      const result = await executeCommand(runCommand, shell, workingDirectory);
      core.setOutput("cache-hit", "false");
      if (includeStdout) {
        core.setOutput("stdout", result.stdout);
      }
      // Let the action succeed/fail based on command exit code
      if (result.exitCode !== 0) {
        process.exit(result.exitCode);
      }
      return;
    }

    const storage = new Storage();
    const bucketName = cachePath.substring(5, cachePath.indexOf('/', 5));
    const fileName = cachePath.substring(bucketName.length + 6);

    // Check if cache exists in GCS
    let cacheHit = false;
    let cachedData: any = null;

    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(fileName);
      const [exists] = await file.exists();

      if (exists) {
        cacheHit = true;
        core.info(`✅ Cache hit for path: ${cachePath}`);
        core.info("Skipping command execution due to cache hit");

        // Download cached data if include-stdout is requested
        if (includeStdout) {
          try {
            const [content] = await file.download();
            cachedData = JSON.parse(content.toString());
          } catch (error) {
            core.debug(`Failed to parse cached data: ${error.message}`);
            cachedData = null;
          }
        }
      }
    } catch (error) {
      core.debug(`Cache check failed: ${error.message}`);
    }

    // Set cache-hit output
    core.setOutput("cache-hit", cacheHit.toString());

    if (cacheHit) {
      // Return cached stdout if available and requested
      if (includeStdout && cachedData && cachedData.stdout) {
        core.setOutput("stdout", cachedData.stdout);
      }
      // Cache hit means work was previously successful, so action succeeds
      return;
    }

    // Execute the command since no cache exists
    core.info(`🚀 Executing command: ${runCommand}`);
    const result = await executeCommand(runCommand, shell, workingDirectory);

    // Set stdout output if requested
    if (includeStdout) {
      core.setOutput("stdout", result.stdout);
    }

    // Only create cache marker on successful execution
    if (result.exitCode === 0) {
      // Create cache entry
      const cacheEntry: any = {
        created: new Date().toISOString(),
        command: runCommand,
        success: true
      };

      // Include stdout in cache if requested
      if (includeStdout) {
        cacheEntry.stdout = result.stdout;
      }

      // Save cache to GCS
      try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);
        await file.save(JSON.stringify(cacheEntry, null, 2), {
          metadata: {
            contentType: 'application/json',
            metadata: {
              cachePath: cachePath,
              created: cacheEntry.created,
              includeStdout: includeStdout.toString()
            }
          }
        });
        core.info(`✅ Cache ${includeStdout ? 'with stdout' : 'marker'} created at: ${cachePath}`);
      } catch (error) {
        core.warning(`Failed to save cache: ${error.message}`);
      }
      // Command succeeded, action succeeds
    } else {
      core.info(`⚠️ Command failed with exit code ${result.exitCode}, not creating cache`);
      // Command failed, action should fail with same exit code
      process.exit(result.exitCode);
    }

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
  }
}

async function executeCommand(
  command: string,
  shell: string,
  workingDirectory: string
): Promise<{stdout: string, stderr: string, exitCode: number}> {

  let stdout = '';
  let stderr = '';

  const options: exec.ExecOptions = {
    cwd: workingDirectory,
    listeners: {
      stdout: (data: Buffer) => {
        stdout += data.toString();
      },
      stderr: (data: Buffer) => {
        stderr += data.toString();
      }
    },
    ignoreReturnCode: true
  };

  // Determine the shell command based on input
  let shellCommand: string[];
  switch (shell.toLowerCase()) {
    case 'bash':
      shellCommand = ['bash', '-c', command];
      break;
    case 'sh':
      shellCommand = ['sh', '-c', command];
      break;
    case 'pwsh':
    case 'powershell':
      shellCommand = ['pwsh', '-Command', command];
      break;
    case 'python':
      shellCommand = ['python', '-c', command];
      break;
    case 'node':
      shellCommand = ['node', '-e', command];
      break;
    default:
      shellCommand = [shell, '-c', command];
  }

  const exitCode = await exec.exec(shellCommand[0], shellCommand.slice(1), options);

  return {
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode
  };
}


if (!process.env.JEST_WORKER_ID) {
  run();
}