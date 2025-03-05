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
}
