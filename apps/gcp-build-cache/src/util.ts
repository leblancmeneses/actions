import * as exec from "@actions/exec";
import * as fs from 'fs';
import * as path from 'path';

export async function writeCacheFileToGcs(cacheKeyPath: string) {
  fs.writeFileSync('file.txt', '');
  await exec.exec("gsutil", ["cp", path.resolve('file.txt'), cacheKeyPath]);
}