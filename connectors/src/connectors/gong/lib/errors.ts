import type { ModelId } from "@dust-tt/types";

type GongAPIErrorType = "validation_error" | "http_response_error";

export class GongAPIError extends Error {
  readonly type: GongAPIErrorType;
  readonly status?: number;
  readonly requestId?: string;
  readonly errors?: string[];
  readonly endpoint: string;
  readonly connectorId: ModelId;

  constructor(
    message: string,
    {
      type,
      status,
      requestId,
      errors,
      endpoint,
      connectorId,
    }: {
      type: GongAPIErrorType;
      status?: number;
      requestId?: string;
      errors?: string[];
      endpoint: string;
      connectorId: ModelId;
    }
  ) {
    super(message);
    this.type = type;
    this.status = status;
    this.requestId = requestId;
    this.errors = errors;
    this.endpoint = endpoint;
    this.connectorId = connectorId;
  }

  static fromAPIError(
    response: Response,
    { endpoint, connectorId }: { endpoint: string; connectorId: ModelId }
  ) {
    return new this(
      `Gong API responded with status: ${response.status} on ${endpoint}`,
      {
        type: "http_response_error",
        status: response.status,
        endpoint,
        connectorId,
      }
    );
  }

  static fromValidationError({
    endpoint,
    connectorId,
  }: {
    endpoint: string;
    connectorId: ModelId;
  }) {
    // TODO(2025-03-05 aubin): Add more details on the fields that are left.
    return new this("Response validation failed", {
      type: "validation_error",
      endpoint,
      connectorId,
    });
  }
}
