import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import type { AgentErrorCategory, ModelProviderIdType } from "@app/types";
import { normalizeError } from "@app/types";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type LLMErrorType =
  // LLM errors
  | "stop_error"
  | "refusal_error"
  | "maximum_length"
  | "terminated_error"
  | "llm_timeout_error"
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

const USERFACING_CLIENT_ID: Record<ModelProviderIdType, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  mistral: "Mistral",
  togetherai: "TogetherAI",
  deepseek: "Deepseek",
  fireworks: "Fireworks",
  xai: "xAI",
  google_ai_studio: "Google AI Studio",
  noop: "Noop",
};

/**
 * Returns LLM error types to user-friendly error messages.
 */
export const getUserFacingLLMErrorMessage = (
  type: LLMErrorType,
  lLMClientMetadata: LLMClientMetadata
): string => {
  const userFacingProvider: string =
    USERFACING_CLIENT_ID[lLMClientMetadata.clientId];
  switch (type) {
    case "stop_error":
      return `${userFacingProvider} stopped the request unexpectedly. Please try again.`;
    case "refusal_error": {
      return `${userFacingProvider} refused to complete your request. Please rephrase your message and try again.`;
    }
    case "maximum_length": {
      return "The response exceeded the maximum length. Try reducing the scope of your request.";
    }
    case "terminated_error": {
      return `${userFacingProvider} terminated the request before completion. Please try again.`;
    }
    case "rate_limit_error": {
      return "Too many requests sent. Please wait a moment and try again.";
    }
    case "overloaded_error": {
      return `${userFacingProvider} is currently overloaded. Please try again in a moment.`;
    }
    case "context_length_exceeded": {
      return "Your message or retrieved data is too large. Break it into smaller parts or reduce the input size.";
    }
    case "invalid_request_error": {
      return "The request was invalid. Please check your input and try again.";
    }
    case "invalid_response_error": {
      return `${userFacingProvider} returned an invalid response. Please try again.`;
    }
    case "authentication_error": {
      return `${userFacingProvider} authentication failed. Please check your API credentials.`;
    }
    case "permission_error": {
      return `${userFacingProvider} blocked your request. Please check your access rights.`;
    }
    case "not_found_error": {
      return "The requested resource was not found. Please verify your request and try again.";
    }
    case "network_error": {
      return `Connection to ${userFacingProvider} failed. Please check your network and try again.`;
    }
    case "timeout_error": {
      return "The request timed out. Please try again.";
    }
    case "server_error": {
      return `${userFacingProvider} encountered an internal error. Please try again.`;
    }
    case "stream_error": {
      return `Connection interrupted while receiving the response. Please try again.`;
    }
    case "unknown_error": {
      return "An unexpected error occurred. Please try again or contact support if the issue persists.";
    }
    case "llm_timeout_error": {
      return `${userFacingProvider} is taking longer than expected. Please try again.`;
    }
    default: {
      assertNever(type);
    }
  }
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
  refusal_error: "unknown_error",
  maximum_length: "context_window_exceeded",
  terminated_error: "retryable_model_error",
  llm_timeout_error: "retryable_model_error",

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
