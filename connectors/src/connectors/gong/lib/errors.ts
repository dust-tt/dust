import type { ModelId } from "@dust-tt/types";

type GongAPIErrorType = "validation_error" | "http_response_error";

export class GongAPIError extends Error {
  readonly type: GongAPIErrorType;
  readonly status?: number;
  readonly requestId?: string;
  readonly errors?: string[];
  readonly endpoint: string;
  readonly connectorId: ModelId;
  readonly pathErrors?: string[];

  constructor(
    message: string,
    {
      connectorId,
      endpoint,
      errors,
      pathErrors,
      requestId,
      status,
      type,
    }: {
      connectorId: ModelId;
      endpoint: string;
      errors?: string[];
      pathErrors?: string[];
      requestId?: string;
      status?: number;
      type: GongAPIErrorType;
    }
  ) {
    super(message);
    this.type = type;

    this.connectorId = connectorId;
    this.endpoint = endpoint;
    this.errors = errors;
    this.pathErrors = pathErrors;
    this.requestId = requestId;
    this.status = status;
  }

  static fromAPIError(
    response: Response,
    {
      connectorId,
      endpoint,
      pathErrors,
    }: { connectorId: ModelId; endpoint: string; pathErrors?: string[] }
  ) {
    return new this(
      `Gong API responded with status: ${response.status} on ${endpoint}`,
      {
        type: "http_response_error",
        connectorId,
        endpoint,
        pathErrors,
        status: response.status,
      }
    );
  }

  static fromValidationError({
    endpoint,
    connectorId,
    pathErrors,
  }: {
    endpoint: string;
    connectorId: ModelId;
    pathErrors: string[];
  }) {
    return new this("Response validation failed", {
      type: "validation_error",
      endpoint,
      connectorId,
      pathErrors,
    });
  }
}
