import * as core from "@actions/core";
import { writeCacheFile } from "./util";
import { WriteOn } from "./types";
import { checkObjectExists, initializeS3Client } from './s3-client';

async function run() {
  try {
    const cacheKeyPath = core.getInput("cache_key_path");
    const writeOn = core.getInput("write-on", { required: false }) as WriteOn;

    if(!cacheKeyPath) {
      core.info("Cache key path not provided, skipping cache upload.");
      return;
    }

    // S3-compatible storage credentials
    const accessKey = core.getInput("access-key", { required: false });
    const secretKey = core.getInput("secret-key", { required: false });
    const s3Endpoint = core.getInput("endpoint", { required: false });
    const s3Region = core.getInput("region", { required: false });

    if (!accessKey || !secretKey) {
      core.info("S3 credentials not provided, skipping cache upload.");
      return;
    }

    initializeS3Client({
      accessKey,
      secretKey,
      endpoint: s3Endpoint || undefined,
      region: s3Region || undefined,
    });

    // Check if cache actually exists instead of relying on environment state
    let cacheExists = false;
    try {
      cacheExists = await checkObjectExists(cacheKeyPath);
    } catch (error) {
      // noop.
    }

    if (cacheExists) {
      core.info("Skipping cache upload: cache already exists.");
      return;
    }

    if (writeOn !== WriteOn.POST) {
      core.info("Skipping cache upload on post.");
      return;
    }

    await writeCacheFile(cacheKeyPath);

    core.info("Cache stored successfully.");
  } catch (error) {
    core.setFailed(`Error storing cache: ${(error as Error).message}`);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
