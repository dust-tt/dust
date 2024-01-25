export type APIErrorType =
  | "internal_server_error"
  | "unknown_connector_provider"
  | "invalid_request_error"
  | "connector_not_found"
  | "connector_configuration_not_found"
  | "connector_update_error"
  | "connector_update_unauthorized"
  | "connector_oauth_target_mismatch"
  | "not_found"
  | "slack_channel_not_found"
  | "connector_rate_limit_error";

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

export type WorkflowErrorType =
  | "unhandled_internal_activity_error"
  | "transient_upstream_activity_error"
  | "transient_nango_activity_error"
  | "upstream_is_down_activity_error";

export type WorkflowError = {
  type: WorkflowErrorType;
  message: string;
  __is_dust_error: boolean;
};

export class HTTPError extends Error {
  readonly statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface NotFoundError extends HTTPError {
  statusCode: 404;
}

// This error is thrown when we are dealing with a revoked OAuth token.
export class ExternalOauthTokenError extends Error {
  constructor(readonly innerError?: Error) {
    super(innerError?.message);
    this.name = "ExternalOauthTokenError";
  }
}

export const NANGO_ERROR_TYPES = ["unknown_connection"];
export type NangoErrorType = (typeof NANGO_ERROR_TYPES)[number];
export class NangoError extends Error {
  readonly type: NangoErrorType;

  constructor(type: NangoErrorType, readonly innerError?: Error) {
    super(innerError?.message);
    this.name = "NangoError";
    this.type = type;
    this.innerError = innerError;
  }
}

export function isNotFoundError(err: unknown): err is NotFoundError {
  return err instanceof HTTPError && err.statusCode === 404;
}
