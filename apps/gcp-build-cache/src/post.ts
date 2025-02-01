import * as core from "@actions/core";
import { writeCacheFileToGcs } from "./util";
import { WriteOn } from "./types";

async function run() {
  try {
    const cacheKeyPath = core.getInput("cache_key_path");
    const writeOn = core.getInput("write-on", { required: false }) as WriteOn;

    if(!cacheKeyPath) {
      core.info("Cache key path not provided, skipping cache upload.");
      return;
    }

    if (process.env.CACHE_HIT === "true") {
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
