import { normalizeError } from "../error_utils";
import { isRecord } from "../type_utils";
import { APIErrorSchema } from "../types";

type DustAPIErrorParams = {
  code: string;
  message: string;
  statusCode?: number;
  requestId?: string;
  cause?: unknown;
};

export class DustAPIError extends Error {
  readonly code: string;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly cause?: unknown;

  constructor({
    code,
    message,
    statusCode,
    requestId,
    cause,
  }: DustAPIErrorParams) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.requestId = requestId;
    this.cause = cause;
    this.name = "DustAPIError";
  }
}

export class DustAuthenticationError extends DustAPIError {
  constructor(params: DustAPIErrorParams) {
    super(params);
    this.name = "DustAuthenticationError";
  }
}

export class DustRateLimitError extends DustAPIError {
  readonly retryAfterSeconds?: number;

  constructor(params: DustAPIErrorParams & { retryAfterSeconds?: number }) {
    super(params);
    this.retryAfterSeconds = params.retryAfterSeconds;
    this.name = "DustRateLimitError";
  }
}

export class DustValidationError extends DustAPIError {
  readonly field?: string;

  constructor(params: DustAPIErrorParams & { field?: string }) {
    super(params);
    this.field = params.field;
    this.name = "DustValidationError";
  }
}

export class DustAgentError extends DustAPIError {
  readonly agentId?: string;

  constructor(params: DustAPIErrorParams & { agentId?: string }) {
    super(params);
    this.agentId = params.agentId;
    this.name = "DustAgentError";
  }
}

export class DustConnectionError extends DustAPIError {
  constructor(params: DustAPIErrorParams) {
    super(params);
    this.name = "DustConnectionError";
  }
}

export class DustStreamConsumedError extends DustAPIError {
  constructor(params: DustAPIErrorParams) {
    super(params);
    this.name = "DustStreamConsumedError";
  }
}

const AUTH_ERROR_TYPES = new Set<string>([
  "invalid_api_key_error",
  "missing_authorization_header_error",
  "malformed_authorization_header_error",
  "not_authenticated",
  "workspace_auth_error",
]);

const RATE_LIMIT_ERROR_TYPES = new Set<string>(["rate_limit_error"]);

const VALIDATION_ERROR_TYPES = new Set<string>([
  "invalid_request_error",
  "invalid_pagination_parameters",
  "invalid_rows_request_error",
  "content_too_large",
  "file_too_large",
  "file_type_not_supported",
]);

const AGENT_ERROR_TYPES = new Set<string>([
  "agent_message_error",
  "global_agent_error",
]);

const CONNECTION_ERROR_TYPES = new Set<string>(["unexpected_network_error"]);

type MinimalApiError = {
  type: string;
  message: string;
};

function toMinimalApiError(error: unknown): MinimalApiError | null {
  const parsed = APIErrorSchema.safeParse(error);
  if (parsed.success) {
    return parsed.data;
  }

  if (isRecord(error)) {
    const type = error["type"];
    const message = error["message"];
    if (typeof type === "string" && typeof message === "string") {
      return { type, message };
    }
  }

  return null;
}

function mapApiError(error: MinimalApiError): DustAPIError {
  if (AUTH_ERROR_TYPES.has(error.type)) {
    return new DustAuthenticationError({
      code: error.type,
      message: error.message,
    });
  }

  if (RATE_LIMIT_ERROR_TYPES.has(error.type)) {
    return new DustRateLimitError({
      code: error.type,
      message: error.message,
    });
  }

  if (VALIDATION_ERROR_TYPES.has(error.type)) {
    return new DustValidationError({
      code: error.type,
      message: error.message,
    });
  }

  if (AGENT_ERROR_TYPES.has(error.type)) {
    return new DustAgentError({
      code: error.type,
      message: error.message,
    });
  }

  if (CONNECTION_ERROR_TYPES.has(error.type)) {
    return new DustConnectionError({
      code: error.type,
      message: error.message,
    });
  }

  return new DustAPIError({
    code: error.type,
    message: error.message,
  });
}

export function toDustAPIError(error: unknown): DustAPIError {
  if (error instanceof DustAPIError) {
    return error;
  }

  const apiError = toMinimalApiError(error);
  if (apiError) {
    return mapApiError(apiError);
  }

  if (error instanceof Error) {
    return new DustConnectionError({
      code: "unexpected_error",
      message: error.message,
      cause: error,
    });
  }

  const normalized = normalizeError(error);
  return new DustConnectionError({
    code: "unexpected_error",
    message: normalized.message,
    cause: normalized,
  });
}

export function isRetryableError(error: DustAPIError): boolean {
  return (
    error instanceof DustRateLimitError || error instanceof DustConnectionError
  );
}
