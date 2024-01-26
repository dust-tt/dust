export type ConnectorsAPIErrorType =
  | "authorization_error"
  | "not_found"
  | "internal_server_error"
  | "unexpected_error_format"
  | "unexpected_response_format"
  | "unknown_connector_provider"
  | "invalid_request_error"
  | "connector_not_found"
  | "connector_configuration_not_found"
  | "connector_update_error"
  | "connector_update_unauthorized"
  | "connector_oauth_target_mismatch"
  | "slack_channel_not_found"
  | "connector_rate_limit_error";

export type ConnectorsAPIError = {
  type: ConnectorsAPIErrorType;
  message: string;
};

export type ConnectorsAPIErrorResponse = {
  error: ConnectorsAPIError;
};

export type ConnectorsAPIErrorWithStatusCode = {
  api_error: ConnectorsAPIError;
  status_code: number;
};

export type WithConnectorsAPIErrorReponse<T> = T | ConnectorsAPIErrorResponse;

export function isConnectorsAPIError(obj: unknown): obj is ConnectorsAPIError {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "message" in obj &&
    typeof obj.message === "string" &&
    "type" in obj &&
    typeof obj.type === "string"
  );
}
