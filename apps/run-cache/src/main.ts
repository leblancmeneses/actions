import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { Storage } from '@google-cloud/storage';
import { CacheMetadata } from "./types";

export async function run() {
  try {
    const runCommand = core.getInput("run", { required: true });
    const shell = core.getInput("shell", { required: false }) || 'bash';
    const workingDirectory = core.getInput("working-directory", { required: false }) || '.';
    const cachePath = core.getInput("cache-path", { required: true });
    const ttl = parseInt(core.getInput("ttl", { required: false }) || '86400');


    // Check if GOOGLE_APPLICATION_CREDENTIALS is set
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      core.warning("GOOGLE_APPLICATION_CREDENTIALS not set, running without cache");
      await executeCommand(runCommand, shell, workingDirectory);
      return;
    }

    const storage = new Storage();
    const bucketName = cachePath.substring(5, cachePath.indexOf('/', 5));
    const fileName = cachePath.substring(bucketName.length + 6);

    // Check if cache exists in GCS
    let cacheHit = false;
    let metadata: CacheMetadata | null = null;

    try {
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(fileName);
      const [exists] = await file.exists();

      if (exists) {
        // Download and parse cache metadata
        const [content] = await file.download();
        metadata = JSON.parse(content.toString());

        // Check if cache is still valid (within TTL)
        const now = Date.now();
        if (metadata && (now - metadata.timestamp) < (metadata.ttl * 1000)) {
          cacheHit = true;
          core.info(`✅ Cache hit for path: ${cachePath}`);
        } else {
          core.info(`⏰ Cache expired for path: ${cachePath}`);
        }
      }
    } catch (error) {
      core.debug(`Cache check failed: ${error.message}`);
    }

    // Set cache-hit output
    core.setOutput("cache-hit", cacheHit.toString());

    if (cacheHit && metadata) {
      // Use cached results
      core.info("Using cached results");
      core.setOutput("stdout", metadata.stdout);
      core.setOutput("stderr", metadata.stderr);
      core.setOutput("exit-code", metadata.exitCode.toString());

      // Display cached output
      if (metadata.stdout) {
        core.info("=== Cached stdout ===");
        core.info(metadata.stdout);
      }
      if (metadata.stderr) {
        core.info("=== Cached stderr ===");
        core.info(metadata.stderr);
      }

      return; // Exit early with cached results
    }

    // Execute the command since no valid cache exists
    core.info(`🚀 Executing command: ${runCommand}`);
    const result = await executeCommand(runCommand, shell, workingDirectory);

    // Set outputs
    core.setOutput("stdout", result.stdout);
    core.setOutput("stderr", result.stderr);
    core.setOutput("exit-code", result.exitCode.toString());

    // Only cache successful executions
    if (result.exitCode === 0) {
      // Create cache metadata
      const cacheData: CacheMetadata = {
        key: cachePath,
        timestamp: Date.now(),
        ttl: ttl,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };

      // Save to GCS
      try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(fileName);
        await file.save(JSON.stringify(cacheData, null, 2), {
          metadata: {
            contentType: 'application/json',
            cacheControl: 'no-cache',
            metadata: {
              cachePath: cachePath,
              timestamp: cacheData.timestamp.toString(),
              ttl: ttl.toString()
            }
          }
        });
        core.info(`✅ Results cached successfully at: ${cachePath}`);
      } catch (error) {
        core.warning(`Failed to save cache: ${error.message}`);
      }
    } else {
      core.info(`⚠️ Command failed with exit code ${result.exitCode}, not caching results`);
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
