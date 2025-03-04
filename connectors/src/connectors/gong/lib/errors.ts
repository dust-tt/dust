type GongAPIErrorType = "validation_error" | "http_response_error";

export class GongAPIError extends Error {
  readonly type: GongAPIErrorType;
  readonly status?: number;
  readonly data?: object;

  constructor(
    message: string,
    {
      type,
      status,
      data,
    }: {
      type: GongAPIErrorType;
      status?: number;
      data?: object;
    }
  ) {
    super(message);
    this.type = type;
    this.status = status;
    this.data = data;
  }
}
