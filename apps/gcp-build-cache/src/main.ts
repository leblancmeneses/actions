import * as core from "@actions/core";
import * as github from '@actions/github';
import { writeCacheFileToGcs } from "./util";
import { WriteOn } from "./types";
import { from, lastValueFrom, mergeMap } from "rxjs";
import { Storage } from '@google-cloud/storage';
import {GoogleCloudAuthException} from './exceptions/google-cloud-auth.exception';

export async function run() {
  try {
    const context = github.context;
    const writeOn = core.getInput("write-on", { required: false }) as WriteOn;
    const cacheKeyPath = core.getInput("cache_key_path", { required: false });
    const affected = JSON.parse(core.getInput("affected", { required: false }) || '{}');
    const pragma = JSON.parse(core.getInput("pragma", { required: false }) || '{}');
    const gcsRootPath = core.getInput("gcs-root-path", { required: false });
    const additionalKeys = JSON.parse(core.getInput("additional-keys", { required: false }) || '{}');

    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      throw new GoogleCloudAuthException();
    }

    const prefix = context.eventName == 'pull_request' ? `pr-${context.payload.pull_request.number}`: context.ref.replace(/^refs\/heads\//, '');

    const gcpBuildCache = Object.keys(affected || {}).reduce((accumulator, key) => {
      if (!affected[key]?.sha && affected[key]?.changes !== true) {
        return accumulator;
      }
      accumulator[key] = {
        'cache-hit': false,
        'path': `${gcsRootPath}/${prefix}-${key}-${affected[key].sha}`,
      };

      for(const target of additionalKeys[key] || []) {
        accumulator[`${key}-${target}`] = {
          'cache-hit': false,
          'path': `${gcsRootPath}/${prefix}-${key}-${target}-${affected[key].sha}`,
        };
      }

      return accumulator;
    }, {} as Record<string, {'cache-hit': boolean, 'path': string}>);

    const storage = new Storage();
    if (cacheKeyPath) {
      let cacheExists = false;
      try {
        const bucketName = cacheKeyPath.substring(0, cacheKeyPath.indexOf('/', 5));
        const fileName = cacheKeyPath.substring(bucketName.length + 1);
        const [exists] = await storage.bucket(bucketName).file(fileName).exists();
        cacheExists = exists;
      } catch (error) {
        // noop.
      }

      if (!cacheExists) {
        core.info(`🚀 Cache not found: ${cacheKeyPath}.`);
      }

      if (cacheExists === false && writeOn === WriteOn.IMMEDIATE) {
        await writeCacheFileToGcs(cacheKeyPath);
      }

      core.setOutput("cache-hit", cacheExists.toString());
      core.exportVariable("CACHE_HIT", cacheExists.toString());
    } else if (Object.keys(gcpBuildCache).length !== 0) {
      await lastValueFrom(from(Object.keys(gcpBuildCache)).pipe(
        mergeMap(async (key) => {
          const cache = gcpBuildCache[key];

          const bucketName = cache.path.substring(0, cache.path.indexOf('/', 5));
          const fileName = cache.path.substring(bucketName.length + 1);

          let cacheExists = false;
          try {
            const [exists] = await storage.bucket(bucketName).file(fileName).exists();
            cacheExists = exists;
          } catch (error) {
            // Log cache not found
            core.info(`🚀 Cache not found: ${cache.path}.`);
          }
          cache['cache-hit'] = cacheExists && !(
            pragma[`${key}-cache`.toLocaleUpperCase()]?.trim().toLocaleUpperCase() === 'SKIP' ||
            pragma['SKIP-CACHE'] === true
          );
        }, 5) // Concurrency: Only 5 tasks run at a time
      ));
      core.setOutput("cache", gcpBuildCache);
      core.info(`Cache: ${JSON.stringify(gcpBuildCache, null, 2)}`);
    }
  } catch (error) {
    if (error instanceof GoogleCloudAuthException) {
      core.setFailed((error as GoogleCloudAuthException).message);
    } else {
      core.setFailed(`Error checking cache: ${(error as Error).message}`);
    }
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}

