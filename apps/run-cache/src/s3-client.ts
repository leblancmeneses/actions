import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

export interface S3Config {
  accessKey: string;
  secretKey: string;
  endpoint?: string;
  region?: string;
}

let s3Client: S3Client | null = null;

export function initializeS3Client(config: S3Config): void {
  s3Client = new S3Client({
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    ...(config.endpoint && { endpoint: config.endpoint }),
    region: config.region || 'auto',
    forcePathStyle: true,
  });
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    throw new Error('S3 client not initialized. Call initializeS3Client first.');
  }
  return s3Client;
}

export function parseS3Path(s3Path: string): { bucket: string; key: string } {
  // Support both s3://bucket/key and gs://bucket/key formats
  const match = s3Path.match(/^(?:s3|gs):\/\/([^/]+)\/(.+)$/);
  if (!match) {
    throw new Error(`Invalid S3 path format: ${s3Path}. Expected s3://bucket/key or gs://bucket/key`);
  }
  return { bucket: match[1], key: match[2] };
}

export async function checkObjectExists(s3Path: string): Promise<boolean> {
  const client = getS3Client();
  const { bucket, key } = parseS3Path(s3Path);

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === 'NotFound' ||
        (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

export async function readObject(s3Path: string): Promise<string | null> {
  const client = getS3Client();
  const { bucket, key } = parseS3Path(s3Path);

  try {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (response.Body) {
      return await response.Body.transformToString();
    }
    return null;
  } catch (error: unknown) {
    if ((error as { name?: string })?.name === 'NoSuchKey' ||
        (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    throw error;
  }
}

export async function writeObject(s3Path: string, content: string, contentType = 'application/json'): Promise<void> {
  const client = getS3Client();
  const { bucket, key } = parseS3Path(s3Path);

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: content,
    ContentType: contentType,
  }));
}
