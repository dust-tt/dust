import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { normalizeError } from "@app/types";

export type LLMErrorType =
  // LLM errors
  | "stop_error"
  | "refusal_error"
  | "maximum_length"
  | "terminated_error"
  // HTTP errors
  | "rate_limit_error"
  | "overloaded_error"
  | "context_length_exceeded"
  | "invalid_request_error"
  | "invalid_response_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "network_error"
  | "timeout_error"
  | "server_error"
  | "stream_error"
  | "unknown_error";

export interface LLMErrorInfo {
  type: LLMErrorType;
  message: string;
  isRetryable: boolean;
  originalError?: unknown;
}

export function handleGenericError(
  error: unknown,
  metadata: LLMClientMetadata
): LLMEvent {
  return new EventError(categorizeLLMError(error, metadata), metadata);
}

/**
 * Categorizes errors from http requests to LLM providers into specific types and determines if they are
 * retryable based on their characteristics.
 *
 * WARNING: This function handles errors that are not specific to a single provider
 * look for $provider/utils/errors.ts for provider-specific error handling.
 */
export function categorizeLLMError(
  error: unknown,
  metadata: LLMClientMetadata
): LLMErrorInfo {
  const normalized = normalizeError(error);
  const errorMessage = normalized.message.toLowerCase();

  // Extract status code if available.
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : undefined;

  if (errorMessage === "terminated") {
    return {
      type: "terminated_error",
      message: `Terminated error for ${metadata.clientId}/${metadata.modelId}. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  if (
    statusCode === 429 ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("quota exceeded") ||
    errorMessage.includes("too many requests")
  ) {
    return {
      type: "rate_limit_error",
      message: `Rate limit exceeded for ${metadata.clientId}/${metadata.modelId}. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  // Check for overloaded/capacity errors (503).
  if (
    statusCode === 503 ||
    errorMessage.includes("overloaded") ||
    errorMessage.includes("capacity") ||
    errorMessage.includes("service unavailable")
  ) {
    return {
      type: "overloaded_error",
      message: `${metadata.clientId} service is overloaded. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  // Check for context length errors.
  if (
    errorMessage.includes("context") ||
    errorMessage.includes("token limit") ||
    errorMessage.includes("maximum context length") ||
    errorMessage.includes("context window") ||
    errorMessage.includes("too large")
  ) {
    return {
      type: "context_length_exceeded",
      message: `Context length exceeded for ${metadata.clientId}/${metadata.modelId}. ${normalized.message}`,
      isRetryable: false,
      originalError: error,
    };
  }

  if (
    statusCode === 401 ||
    errorMessage.includes("unauthorized") ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("api key")
  ) {
    return {
      type: "authentication_error",
      message: `Authentication failed for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError: error,
    };
  }

  if (
    statusCode === 403 ||
    errorMessage.includes("forbidden") ||
    errorMessage.includes("permission")
  ) {
    return {
      type: "permission_error",
      message: `Permission denied for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError: error,
    };
  }

  if (statusCode === 404 || errorMessage.includes("not found")) {
    return {
      type: "not_found_error",
      message: `Resource not found for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError: error,
    };
  }

  if (
    statusCode === 400 ||
    errorMessage.includes("invalid request") ||
    errorMessage.includes("bad request") ||
    errorMessage.includes("validation error")
  ) {
    return {
      type: "invalid_request_error",
      message: `Invalid request to ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError: error,
    };
  }

  // Check for network errors.
  if (
    errorMessage.includes("network") ||
    errorMessage.includes("connection") ||
    errorMessage.includes("econnrefused") ||
    errorMessage.includes("enotfound") ||
    errorMessage.includes("etimedout")
  ) {
    return {
      type: "network_error",
      message: `Network error connecting to ${metadata.clientId}. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  // Check for timeout errors.
  if (errorMessage.includes("timeout") || errorMessage.includes("timed out")) {
    return {
      type: "timeout_error",
      message: `Request timeout for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  // Check for stream-specific errors.
  if (
    errorMessage.includes("stream") ||
    errorMessage.includes("streaming") ||
    errorMessage.includes("interrupted")
  ) {
    return {
      type: "stream_error",
      message: `Stream error from ${metadata.clientId}. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  if (
    (statusCode != null && statusCode >= 500 && statusCode < 600) ||
    errorMessage.includes("internal server error") ||
    errorMessage.includes("server error")
  ) {
    return {
      type: "server_error",
      message: `Server error from ${metadata.clientId}. ${normalized.message}`,
      isRetryable: true,
      originalError: error,
    };
  }

  return {
    type: "unknown_error",
    message: `Unknown error from ${metadata.clientId}: ${normalized.message}`,
    isRetryable: false,
    originalError: error,
  };
}
