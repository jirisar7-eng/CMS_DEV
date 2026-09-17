export class PagesApiClientError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'PagesApiClientError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, PagesApiClientError.prototype);
  }
}
