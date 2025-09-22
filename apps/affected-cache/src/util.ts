import { Storage } from '@google-cloud/storage';

export async function writeCacheFileToGcs(cacheKeyPath: string) {
  const storage = new Storage();

  const bucketName = cacheKeyPath.substring(0, cacheKeyPath.indexOf('/', 5));
  const destinationFilename = cacheKeyPath.substring(bucketName.length + 1);

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destinationFilename);

  await file.save('', {
    resumable: false,
    metadata: {
      contentType: 'text/plain',
    },
  });
}