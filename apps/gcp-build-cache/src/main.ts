import * as core from "@actions/core";
import * as exec from "@actions/exec";

export async function run() {
  try {
    const cacheKeyPath = core.getInput("cache_key_path", { required: false });
    const affected = JSON.parse(core.getInput("affected", { required: false }) || '{}');
    const pragma = JSON.parse(core.getInput("pragma", { required: false }) || '{}');
    const gcsRootPath = core.getInput("gcs-root-path", { required: true });
    const additionalKeys = JSON.parse(core.getInput("additional-keys", { required: false }) || '{}');

    try {
      await exec.exec("gcloud", ["--version"]);
      await exec.exec("gsutil", ["--version"]);
    } catch (error) {
      core.info(`❌ Cache tools not installed`);
    }


    const gcpBuildCache = {} as Record<string, {'cache-hit': boolean, 'path': string}>;
    Object.keys(affected.changes || {}).reduce((accumulator, key) => {
      gcpBuildCache[key] = {
        'cache-hit': false,
        'path': `${gcsRootPath}/${key}-${affected.shas[key]}`,
      };

      for(const target of additionalKeys[key] || []) {
        gcpBuildCache[`${key}-${target}`] = {
          'cache-hit': false,
          'path': `${gcsRootPath}/${key}-${target}-${affected.shas[key]}`,
        };
      }

      return accumulator;
    }, gcpBuildCache);

    if (cacheKeyPath) {
      let cacheExists = false;
      try {
        await exec.exec("gsutil", ["-q", "stat", cacheKeyPath], { silent: false });
        cacheExists = true;
        core.info(`✅ Cache exists: ${cacheKeyPath}`);
      } catch (error) {
        core.info(`🚀 Cache not found: ${cacheKeyPath}, proceeding with build.`);
      }
      core.setOutput("cache-hit", cacheExists.toString());
      core.exportVariable("CACHE_HIT", cacheExists.toString());
    } else if (Object.keys(gcpBuildCache).length === 0) {
      for (const key in gcpBuildCache) {
        const cacheKey = gcpBuildCache[key];
        let cacheExists = false;
        try {
          await exec.exec("gsutil", ["-q", "stat", cacheKey.path], { silent: false });
          cacheExists = true;
          core.info(`✅ Cache exists: ${cacheKey.path}`);
        } catch (error) {
          core.info(`🚀 Cache not found: ${cacheKey.path}`);
        }
        gcpBuildCache[key]['cache-hit'] = cacheExists && (pragma[`${cacheKey}-cache`.toLocaleUpperCase()]?.().trim().toLocaleUpperCase() !== 'SKIP');
      }
      core.setOutput("cache", gcpBuildCache);
    }

  } catch (error) {
    core.setFailed(`Error checking cache: ${(error as Error).message}`);
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}

