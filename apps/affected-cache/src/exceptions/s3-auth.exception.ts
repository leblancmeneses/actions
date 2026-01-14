export class S3AuthException extends Error {
  constructor(message = 'S3-compatible storage authentication is not configured. Ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables are set (or use OIDC/IAM role authentication).') {
    super(message);
    this.name = 'S3AuthenticationException';
    Object.setPrototypeOf(this, S3AuthException.prototype);
  }
}
