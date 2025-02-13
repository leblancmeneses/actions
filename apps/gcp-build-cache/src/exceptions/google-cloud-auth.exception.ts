export class GoogleCloudAuthException extends Error {
  constructor(message = 'Google Cloud authentication is not configured. Ensure google-github-actions/auth@v2 is executed first.') {
    super(message);
    this.name = 'GoogleCloudAuthenticationException';
    Object.setPrototypeOf(this, GoogleCloudAuthException.prototype);
  }
}
