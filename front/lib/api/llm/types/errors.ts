import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { AgentErrorCategory } from "@app/types";
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

/**
 * Maps LLM error types to user-friendly error messages.
 */
export const USER_FACING_LLM_ERROR_MESSAGES: Record<LLMErrorType, string> = {
  stop_error: "The model request was stopped unexpectedly. Please try again.",
  refusal_error:
    "The model refused to complete your request. Please rephrase and try again.",
  maximum_length:
    "The response exceeded the maximum allowed length. Try reducing the scope of your request.",
  terminated_error:
    "The request was terminated before completion. Please try again.",
  rate_limit_error:
    "Too many requests have been made. Please wait a moment and try again.",
  overloaded_error:
    "The service is currently experiencing high load. Please try again in a moment.",
  context_length_exceeded:
    "Your message or retrieved data is too large. Break your request into smaller parts or reduce the input size.",
  invalid_request_error:
    "The request was invalid. Please check your input and try again.",
  invalid_response_error:
    "The service returned an invalid response. Please try again.",
  authentication_error:
    "Failed to authenticate with the service. Please check your API credentials.",
  permission_error:
    "You don't have permission to access this resource. Please check your access rights.",
  not_found_error:
    "The requested resource was not found. Please verify the request details.",
  network_error:
    "A network error occurred while connecting to the service. Please check your connection and try again.",
  timeout_error: "The request took too long to complete. Please try again.",
  server_error: "The service encountered an internal error. Please try again.",
  stream_error:
    "Connection interrupted while receiving the response. Please try again.",
  unknown_error:
    "An unexpected error occurred. Please try again or contact support if the problem persists.",
};

/**
 * Maps LLM error types to agent error categories.
 * This mapping allows LLM errors to be categorized consistently with agent errors.
 */
export const LLM_ERROR_TYPE_TO_CATEGORY: Record<
  LLMErrorType,
  AgentErrorCategory
> = {
  // LLM errors - these are generally retryable or model-specific issues
  stop_error: "retryable_model_error",
  refusal_error: "retryable_model_error",
  maximum_length: "context_window_exceeded",
  terminated_error: "retryable_model_error",

  // HTTP errors - rate limiting and overload
  rate_limit_error: "retryable_model_error",
  overloaded_error: "retryable_model_error",
  context_length_exceeded: "context_window_exceeded",

  // HTTP errors - client errors (non-retryable)
  invalid_request_error: "unknown_error",
  invalid_response_error: "invalid_response_format_configuration",
  authentication_error: "unknown_error",
  permission_error: "unknown_error",
  not_found_error: "unknown_error",

  // HTTP errors - network and connectivity
  network_error: "stream_error",
  timeout_error: "retryable_model_error",
  server_error: "provider_internal_error",
  stream_error: "stream_error",

  // Catch-all
  unknown_error: "unknown_error",
};
