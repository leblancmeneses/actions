import * as core from "@actions/core";
import * as exec from "@actions/exec";

async function run() {
  try {
    const cacheKeyPath = core.getInput("CACHE_KEY_PATH");

    if (process.env.CACHE_HIT === "true") {
      core.info("🔄 Skipping cache upload: cache already exists.");
      return;
    }

    await exec.exec("touch", ["file.txt"]);
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
