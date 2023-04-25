export type APIErrorType =
  | "internal_server_error"
  | "unknown_connector_provider"
  | "invalid_request_error";

export type APIError = {
  type: APIErrorType;
  message: string;
};

export type APIErrorWithStatusCode = {
  api_error: APIError;
  status_code: number;
};

export function errorFromAny(e: any): Error {
  return {
    name: e.name || "Error",
    message: e.message || "Unknown error",
    stack: e.stack || "No stack trace",
  };
}
