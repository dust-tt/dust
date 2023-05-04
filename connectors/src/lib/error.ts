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

// JS cannot give you any guarantee about the shape of an error you `catch`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorFromAny(e: any): Error {
  return {
    name: e.name || "Error",
    message: e.message || "Unknown error",
    stack: e.stack || "No stack trace",
  };
}

export type WorkflowErrorType = "unhandled_internal_activity_error";

export type WorkflowError = {
  type: WorkflowErrorType;
  message: string;
  __is_dust_error: boolean;
};
