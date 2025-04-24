export class LabsConnectionAPIError extends Error {
  readonly status?: number | string;
  readonly endpoint: string;
  readonly pathErrors?: string[];

  constructor(
    message: string,
    {
      endpoint,
      status,
      pathErrors,
    }: {
      endpoint: string;
      status?: number | string;
      pathErrors?: string[];
    }
  ) {
    super(message);
    this.endpoint = endpoint;
    this.status = status;
    this.pathErrors = pathErrors;
  }

  static fromValidationError({
    endpoint,
    pathErrors,
  }: {
    endpoint: string;
    pathErrors: string[];
  }) {
    return new this("Response validation failed", {
      endpoint,
      pathErrors,
    });
  }
}
