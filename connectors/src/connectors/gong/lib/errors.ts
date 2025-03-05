type GongAPIErrorType = "validation_error" | "http_response_error";

export class GongAPIError extends Error {
  readonly type: GongAPIErrorType;
  readonly status?: number;
  readonly requestId?: string;
  readonly errors?: string[];

  constructor(
    message: string,
    {
      type,
      status,
      requestId,
      errors,
    }: {
      type: GongAPIErrorType;
      status?: number;
      requestId?: string;
      errors?: string[];
    }
  ) {
    super(message);
    this.type = type;
    this.status = status;
    this.requestId = requestId;
    this.errors = errors;
  }
}
