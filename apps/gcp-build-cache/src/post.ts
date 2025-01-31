import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as fs from 'fs';

async function run() {
  try {
    const cacheKeyPath = core.getInput("cache_key_path");

    if (process.env.CACHE_HIT === "true") {
      core.info("🔄 Skipping cache upload: cache already exists.");
      return;
    }

    fs.writeFileSync('file.txt', '');
    await exec.exec("gsutil", ["cp", "file.txt", cacheKeyPath]);

    core.info("✅ Cache stored successfully.");
  } catch (error) {
    core.setFailed(`Error storing cache: ${(error as Error).message}`);
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
