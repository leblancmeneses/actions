import { writeEmptyObject } from './s3-client';

export async function writeCacheFile(cacheKeyPath: string) {
  await writeEmptyObject(cacheKeyPath);
}
