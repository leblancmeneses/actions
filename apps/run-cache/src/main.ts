import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { initializeS3Client, checkObjectExists, readObject, writeObject } from './s3-client';

export async function run() {
  try {
    // S3-compatible storage credentials
    const accessKey = core.getInput("access-key", { required: false });
    const secretKey = core.getInput("secret-key", { required: false });
    const endpoint = core.getInput("endpoint", { required: false });
    const region = core.getInput("region", { required: false });

    const runCommand = core.getInput("run", { required: true });
    const shell = core.getInput("shell", { required: false }) || 'bash';
    const workingDirectory = core.getInput("working-directory", { required: false }) || '.';
    const cachePath = core.getInput("cache-path", { required: true });
    const includeStdout = core.getInput("include-stdout", { required: false }).toLowerCase() === 'true';

    // Check if S3 credentials are available
    if (!accessKey || !secretKey) {
      core.warning("S3 credentials not provided, running without cache");
      const result = await executeCommand(runCommand, shell, workingDirectory);
      core.setOutput("cache-hit", false);
      if (includeStdout) {
        core.setOutput("stdout", result.stdout);
      }
      // Let the action succeed/fail based on command exit code
      if (result.exitCode !== 0) {
        process.exit(result.exitCode);
      }
      return;
    }

    initializeS3Client({
      accessKey,
      secretKey,
      endpoint: endpoint || undefined,
      region: region || undefined,
    });

    // Check if cache exists
    let cacheHit = false;
    let cachedData: { stdout?: string } | null = null;

    try {
      const exists = await checkObjectExists(cachePath);

      if (exists) {
        cacheHit = true;
        core.info(`Cache hit for path: ${cachePath}`);
        core.info("Skipping command execution due to cache hit");

        // Download cached data if include-stdout is requested
        if (includeStdout) {
          try {
            const content = await readObject(cachePath);
            if (content) {
              cachedData = JSON.parse(content);
            }
          } catch (error) {
            core.debug(`Failed to parse cached data: ${(error as Error).message}`);
            cachedData = null;
          }
        }
      }
    } catch (error) {
      core.debug(`Cache check failed: ${(error as Error).message}`);
    }

    // Set cache-hit output
    core.setOutput("cache-hit", cacheHit);

    if (cacheHit) {
      // Return cached stdout if available and requested
      if (includeStdout && cachedData && cachedData.stdout) {
        core.setOutput("stdout", cachedData.stdout);
      }
      // Cache hit means work was previously successful, so action succeeds
      return;
    }

    // Execute the command since no cache exists
    core.info(`Executing command: ${runCommand}`);
    const result = await executeCommand(runCommand, shell, workingDirectory);

    // Set stdout output if requested
    if (includeStdout) {
      core.setOutput("stdout", result.stdout);
    }

    // Only create cache marker on successful execution
    if (result.exitCode === 0) {
      // Create cache entry
      const cacheEntry: { created: string; command: string; success: boolean; stdout?: string } = {
        created: new Date().toISOString(),
        command: runCommand,
        success: true
      };

      // Include stdout in cache if requested
      if (includeStdout) {
        cacheEntry.stdout = result.stdout;
      }

      // Save cache
      try {
        await writeObject(cachePath, JSON.stringify(cacheEntry, null, 2));
        core.info(`Cache ${includeStdout ? 'with stdout' : 'marker'} created at: ${cachePath}`);
      } catch (error) {
        core.warning(`Failed to save cache: ${(error as Error).message}`);
      }
      // Command succeeded, action succeeds
    } else {
      core.info(`Command failed with exit code ${result.exitCode}, not creating cache`);
      // Command failed, action should fail with same exit code
      process.exit(result.exitCode);
    }

  } catch (error) {
    core.setFailed(`Action failed: ${(error as Error).message}`);
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
