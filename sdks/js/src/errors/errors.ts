import type { APIError } from "../types";

export abstract class DustError extends Error {
  abstract readonly code: string;
  readonly requestId?: string;
  readonly statusCode?: number;
  readonly cause?: Error;

  constructor(
    message: string,
    options?: { requestId?: string; statusCode?: number; cause?: Error }
  ) {
    super(message);
    this.name = this.constructor.name;
    this.requestId = options?.requestId;
    this.statusCode = options?.statusCode;
    this.cause = options?.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toString(): string {
    let str = `${this.name} [${this.code}]: ${this.message}`;
    if (this.statusCode) {
      str += ` (status: ${this.statusCode})`;
    }
    if (this.requestId) {
      str += ` (requestId: ${this.requestId})`;
    }
    return str;
  }
}

export class DustAuthenticationError extends DustError {
  readonly code = "authentication_error";
}

export class DustRateLimitError extends DustError {
  readonly code = "rate_limit_error";
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      retryAfterMs?: number;
    }
  ) {
    super(message, options);
    this.retryAfterMs = options?.retryAfterMs;
  }
}

export class DustValidationError extends DustError {
  readonly code = "validation_error";
  readonly field?: string;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      field?: string;
    }
  ) {
    super(message, options);
    this.field = options?.field;
  }
}

export class DustAgentError extends DustError {
  readonly code = "agent_error";
  readonly agentId?: string;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      agentId?: string;
    }
  ) {
    super(message, options);
    this.agentId = options?.agentId;
  }
}

export class DustNetworkError extends DustError {
  readonly code = "network_error";
  readonly isRetryable: boolean;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      isRetryable?: boolean;
    }
  ) {
    super(message, options);
    this.isRetryable = options?.isRetryable ?? true;
  }
}

export class DustCancelledError extends DustError {
  readonly code = "cancelled";

  constructor(message = "Operation cancelled") {
    super(message);
  }
}

export class DustTimeoutError extends DustError {
  readonly code = "timeout";
  readonly timeoutMs?: number;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      timeoutMs?: number;
    }
  ) {
    super(message, options);
    this.timeoutMs = options?.timeoutMs;
  }
}

export class DustNotFoundError extends DustError {
  readonly code = "not_found";
  readonly resourceType?: string;
  readonly resourceId?: string;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      resourceType?: string;
      resourceId?: string;
    }
  ) {
    super(message, options);
    this.resourceType = options?.resourceType;
    this.resourceId = options?.resourceId;
  }
}

export class DustPermissionError extends DustError {
  readonly code = "permission_denied";
}

export class DustServerError extends DustError {
  readonly code = "server_error";
}

export class DustContentTooLargeError extends DustError {
  readonly code = "content_too_large";
}

export class DustUnknownError extends DustError {
  readonly code = "unknown_error";
  readonly originalError?: APIError;

  constructor(
    message: string,
    options?: {
      requestId?: string;
      statusCode?: number;
      cause?: Error;
      originalError?: APIError;
    }
  ) {
    super(message, options);
    this.originalError = options?.originalError;
  }
}

export type DustErrorType =
  | DustAuthenticationError
  | DustRateLimitError
  | DustValidationError
  | DustAgentError
  | DustNetworkError
  | DustCancelledError
  | DustTimeoutError
  | DustNotFoundError
  | DustPermissionError
  | DustServerError
  | DustContentTooLargeError
  | DustUnknownError;

export type DustErrorCode = DustErrorType["code"];

interface BaseErrorOptions {
  requestId?: string;
  statusCode?: number;
  cause?: Error;
}

const errorTypeMapping: Record<
  string,
  new (
    message: string,
    options?: BaseErrorOptions
  ) => DustError
> = {
  not_authenticated: DustAuthenticationError,
  invalid_api_key_error: DustAuthenticationError,
  malformed_authorization_header_error: DustAuthenticationError,
  workspace_auth_error: DustAuthenticationError,
  rate_limit_error: DustRateLimitError,
  invalid_request_error: DustValidationError,
  invalid_pagination_parameters: DustValidationError,
  missing_required_parameters: DustValidationError,
  file_type_not_supported: DustValidationError,
  conversation_not_found: DustNotFoundError,
  agent_configuration_not_found: DustNotFoundError,
  data_source_not_found: DustNotFoundError,
  file_not_found: DustNotFoundError,
  message_not_found: DustNotFoundError,
  workspace_not_found: DustNotFoundError,
  space_not_found: DustNotFoundError,
  user_not_found: DustNotFoundError,
  not_found: DustNotFoundError,
  subscription_payment_failed: DustPermissionError,
  plan_limit_error: DustPermissionError,
  plan_message_limit_exceeded: DustPermissionError,
  subscription_required: DustPermissionError,
  content_too_large: DustContentTooLargeError,
  internal_server_error: DustServerError,
  unexpected_network_error: DustNetworkError,
};

const statusCodeMapping: Record<
  number,
  new (
    message: string,
    options?: BaseErrorOptions
  ) => DustError
> = {
  401: DustAuthenticationError,
  403: DustPermissionError,
  404: DustNotFoundError,
  408: DustTimeoutError,
  413: DustContentTooLargeError,
  429: DustRateLimitError,
};

export function apiErrorToDustError(
  apiError: APIError,
  statusCode?: number
): DustError {
  const ErrorClass = errorTypeMapping[apiError.type];
  if (ErrorClass) {
    return new ErrorClass(apiError.message, { statusCode });
  }

  if (statusCode) {
    const StatusErrorClass = statusCodeMapping[statusCode];
    if (StatusErrorClass) {
      return new StatusErrorClass(apiError.message, { statusCode });
    }
    if (statusCode >= 500) {
      return new DustServerError(apiError.message, { statusCode });
    }
  }

  return new DustUnknownError(apiError.message, {
    statusCode,
    originalError: apiError,
  });
}

export function isDustError(error: unknown): error is DustError {
  return error instanceof DustError;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof DustNetworkError) {
    return error.isRetryable;
  }
  return (
    error instanceof DustRateLimitError ||
    error instanceof DustTimeoutError ||
    error instanceof DustServerError
  );
}
