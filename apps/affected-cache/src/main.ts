import * as core from "@actions/core";
import * as github from '@actions/github';
import { writeCacheFile } from "./util";
import { WriteOn } from "./types";
import { from, lastValueFrom, mergeMap } from "rxjs";
import { checkObjectExists, initializeS3Client } from './s3-client';
import { S3AuthException } from './exceptions/s3-auth.exception';

export async function run() {
  try {
    const context = github.context;
    const writeOn = core.getInput("write-on", { required: false }) as WriteOn;
    const cacheKeyPath = core.getInput("cache_key_path", { required: false });
    const affected = JSON.parse(core.getInput("affected", { required: false }) || '{}');
    const pragma = JSON.parse(core.getInput("pragma", { required: false }) || '{}');
    const storagePath = core.getInput("storage-path", { required: false });
    const additionalKeys = JSON.parse(core.getInput("additional-keys", { required: false }) || '{}');

    // S3-compatible storage credentials
    const accessKey = core.getInput("access-key", { required: false });
    const secretKey = core.getInput("secret-key", { required: false });
    const s3Endpoint = core.getInput("endpoint", { required: false });
    const s3Region = core.getInput("region", { required: false });

    if (!accessKey || !secretKey) {
      throw new S3AuthException();
    }

    initializeS3Client({
      accessKey,
      secretKey,
      endpoint: s3Endpoint || undefined,
      region: s3Region || undefined,
    });

    const prefix = context.eventName == 'pull_request' ? `pr-${context.payload.pull_request.number}`: context.ref.replace(/^refs\/heads\//, '');

    const buildCache = Object.keys(affected || {}).reduce((accumulator, key) => {
      const target = affected[key];
      if (!target?.sha) {
        return accumulator;
      }
      accumulator[key] = {
        'cache-hit': false,
        'path': `${storagePath}/${prefix}-${key}-${target.sha}`,
      };

      for(const targetSuffix of additionalKeys[key] || []) {
        accumulator[`${key}-${targetSuffix}`] = {
          'cache-hit': false,
          'path': `${storagePath}/${prefix}-${key}-${targetSuffix}-${target.sha}`,
        };
      }

      return accumulator;
    }, {} as Record<string, {'cache-hit': boolean, 'path': string}>);

    if (cacheKeyPath) {
      let cacheExists = false;
      try {
        cacheExists = await checkObjectExists(cacheKeyPath);
      } catch (error) {
        // noop.
      }

      if (!cacheExists) {
        core.info(`🚀 Cache not found: ${cacheKeyPath}.`);
      }

      if (cacheExists === false && writeOn === WriteOn.IMMEDIATE) {
        await writeCacheFile(cacheKeyPath);
      }

      core.setOutput("cache-hit", cacheExists.toString());
      core.exportVariable("CACHE_HIT", cacheExists.toString());
    } else {
      if (Object.keys(buildCache).length !== 0) {
        await lastValueFrom(from(Object.keys(buildCache)).pipe(
          mergeMap(async (key) => {
            const cache = buildCache[key];

            let cacheExists = false;
            try {
              cacheExists = await checkObjectExists(cache.path);
            } catch (error) {
              // noop.
            }

            if (!cacheExists) {
              core.info(`🚀 Cache not found: ${cache.path}.`);
            }
            cache['cache-hit'] = cacheExists && !(
              pragma[`${key}-cache`.toLocaleUpperCase()]?.trim().toLocaleUpperCase() === 'SKIP' ||
              pragma['SKIP-CACHE'] === true
            );
          }, 5) // Concurrency: Only 5 tasks run at a time
        ));
      }
      core.setOutput("cache", buildCache);
      core.info(`Cache: ${JSON.stringify(buildCache, null, 2)}`);
    }
  } catch (error) {
    if (error instanceof S3AuthException) {
      core.setFailed((error as S3AuthException).message);
    } else {
      core.setFailed(`Error checking cache: ${(error as Error).message}`);
    }
    throw error;
  }
}

if (!process.env.JEST_WORKER_ID) {
  run();
}
