import * as core from "@actions/core";
import { writeCacheFileToGcs } from "./util";
import { WriteOn } from "./types";
import { Storage } from '@google-cloud/storage';

async function run() {
  try {
    const cacheKeyPath = core.getInput("cache_key_path");
    const writeOn = core.getInput("write-on", { required: false }) as WriteOn;

    if(!cacheKeyPath) {
      core.info("Cache key path not provided, skipping cache upload.");
      return;
    }

    // Check if cache actually exists instead of relying on environment state
    const storage = new Storage();
    let cacheExists = false;
    try {
      const bucketName = cacheKeyPath.substring(0, cacheKeyPath.indexOf('/', 5));
      const fileName = cacheKeyPath.substring(bucketName.length + 1);
      const [exists] = await storage.bucket(bucketName).file(fileName).exists();
      cacheExists = exists;
    } catch (error) {
      // noop.
    }

    if (cacheExists) {
      core.info("🔄 Skipping cache upload: cache already exists.");
      return;
    }

    if (writeOn !== WriteOn.POST) {
      core.info("🔄 Skipping cache upload on post.");
      return;
    }

    await writeCacheFileToGcs(cacheKeyPath);

    core.info("✅ Cache stored successfully.");
  } catch (error) {
    core.setFailed(`Error storing cache: ${(error as Error).message}`);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
