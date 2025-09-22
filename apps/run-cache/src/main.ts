import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Storage } from '@google-cloud/storage';

export async function run() {
  try {
    const runCommand = core.getInput("run", { required: true });
    const shell = core.getInput("shell", { required: false }) || 'bash';
    const workingDirectory = core.getInput("working-directory", { required: false }) || '.';
    const cachePath = core.getInput("cache-path", { required: true });

    // Check if GOOGLE_APPLICATION_CREDENTIALS is set
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      core.warning("GOOGLE_APPLICATION_CREDENTIALS not set, running without cache");
      const result = await executeCommand(runCommand, shell, workingDirectory);
      core.setOutput("cache-hit", "false");
      core.setOutput("exit-code", result.exitCode.toString());
      return;
    }

    const storage = new Storage();
    const bucketName = cachePath.substring(5, cachePath.indexOf('/', 5));
    const fileName = cachePath.substring(bucketName.length + 6);

    // Check if cache exists in GCS
    let cacheHit = false;

    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(fileName);
      const [exists] = await file.exists();

      if (exists) {
        cacheHit = true;
        core.info(`✅ Cache hit for path: ${cachePath}`);
        core.info("Skipping command execution due to cache hit");
      }
    } catch (error) {
      core.debug(`Cache check failed: ${error.message}`);
    }

    // Set cache-hit output
    core.setOutput("cache-hit", cacheHit.toString());

    if (cacheHit) {
      // Skip execution entirely - cache hit means the work was already done
      core.setOutput("exit-code", "0");
      return;
    }

    // Execute the command since no cache exists
    core.info(`🚀 Executing command: ${runCommand}`);
    const result = await executeCommand(runCommand, shell, workingDirectory);

    // Set outputs
    core.setOutput("exit-code", result.exitCode.toString());

    // Only create cache marker on successful execution
    if (result.exitCode === 0) {
      // Create simple cache marker with timestamp
      const cacheMarker = {
        created: new Date().toISOString(),
        command: runCommand,
        success: true
      };

      // Save cache marker to GCS
      try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);
        await file.save(JSON.stringify(cacheMarker, null, 2), {
          metadata: {
            contentType: 'application/json',
            metadata: {
              cachePath: cachePath,
              created: cacheMarker.created
            }
          }
        });
        core.info(`✅ Cache marker created at: ${cachePath}`);
      } catch (error) {
        core.warning(`Failed to save cache marker: ${error.message}`);
      }
    } else {
      core.info(`⚠️ Command failed with exit code ${result.exitCode}, not creating cache marker`);
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