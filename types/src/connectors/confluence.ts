import { ModelId } from "../shared/model_id";

export function makeConfluenceSyncWorkflowId(connectorId: ModelId) {
  return `confluence-sync-${connectorId}`;
}

export class ConfluenceClientError extends Error {
  readonly type: "validation_error" | "http_response_error";
  readonly status?: number;
  readonly data?: object;
  constructor(
    message: string,
    error_data: (
      | { type: "http_response_error"; status: number }
      | { type: "validation_error" }
    ) & { data?: object }
  ) {
    super(message);
    this.type = error_data.type;
    this.status =
      error_data.type === "http_response_error" ? error_data.status : undefined;
    this.data = error_data.data;
  }
}
