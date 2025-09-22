export interface CacheMetadata {
  key: string;
  timestamp: number;
  ttl: number;
  stdout: string;
  stderr: string;
  exitCode: number;
}