// JS cannot give you any guarantee about the shape of an error you `catch`

import type { APIError, ConnectorProvider } from "@dust-tt/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errorFromAny(e: any): Error {
  return {
    name: e.name || "Error",
    message: e.message || "Unknown error",
    stack: e.stack || "No stack trace",
  };
}

// Generate dynamic error types.
type ProviderErrorType =
  | "rate_limit_error"
  | "transient_upstream_activity_error";

// Define general workflow error types.
type GeneralWorkflowErrorType =
  | "transient_upstream_activity_error"
  | "unhandled_internal_activity_error"
  | "workflow_timeout_failure";

type TablesErrorType = "invalid_headers" | "file_too_large" | "invalid_csv";

// Combine both general and provider-specific error types.
type WorkflowErrorType = GeneralWorkflowErrorType | ProviderErrorType;

export class DustConnectorWorkflowError extends Error {
  constructor(
    message: string,
    readonly type: WorkflowErrorType,
    readonly originalError?: Error | APIError
  ) {
    super(message);
  }
}

// Define a specific error class for provider-related errors.
export class ProviderWorkflowError extends DustConnectorWorkflowError {
  constructor(
    public readonly provider: ConnectorProvider,
    message: string,
    type: ProviderErrorType,
    originalError?: Error | APIError
  ) {
    super(message, type, originalError);
  }
}

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

// This error is thrown when we are dealing with a revoked OAuth token, or more
// generally Oauth issues due to a revoked access
export class ExternalOAuthTokenError extends Error {
  constructor(readonly innerError?: Error) {
    super(innerError?.message);
    this.name = "ExternalOAuthTokenError";
  }
}

export function isNotFoundError(err: unknown): err is NotFoundError {
  return err instanceof HTTPError && err.statusCode === 404;
}

// Error for invalid rows when upserting table
export class TablesError extends Error {
  constructor(
    public type: TablesErrorType,
    message: string
  ) {
    super(message);
    this.name = "TablesError";
  }
}
