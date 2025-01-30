import * as core from "@actions/core";
import * as exec from "@actions/exec";

export async function run() {
  try {
    const cacheKeyPath = core.getInput("CACHE_KEY_PATH");
    const credentialsJson = core.getInput("credentials_json");

    try {
      await exec.exec("gcloud", ["--version"]);
    } catch (error) {
      await exec.exec("gh", ["run", "google-github-actions/setup-gcloud@v2.1.2"]);
      await exec.exec("gh", ["run", "google-github-actions/auth@v2", "--with", `credentials_json=${credentialsJson}`]);
    }

    // Check if cache exists
    let cacheExists = false;
    try {
      await exec.exec("gsutil", ["-q", "stat", cacheKeyPath], { silent: true });
      cacheExists = true;
      core.info(`✅ Cache exists: ${cacheKeyPath}`);
    } catch (error) {
      core.info(`🚀 Cache not found: ${cacheKeyPath}, proceeding with build.`);
    }

    // Set the cache hit output
    core.setOutput("CACHE_HIT", cacheExists.toString());
    core.exportVariable("CACHE_HIT", cacheExists ? "true" : "false");
  } catch (error) {
    core.setFailed(`Error checking cache: ${(error as Error).message}`);
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}

