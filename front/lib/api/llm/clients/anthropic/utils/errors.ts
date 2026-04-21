import type { APIError } from "@anthropic-ai/sdk";
import { AnthropicError, APIConnectionError } from "@anthropic-ai/sdk";

import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// https://github.com/anthropics/anthropic-sdk-typescript#handling-errors
export const handleError = (
  err: APIError,
  metadata: LLMClientMetadata
): LLMEvent => {
  return new EventError(categorizeAnthropicError(err, metadata), metadata);
};

// From BaseAnthropic.shouldRetry
// The function is private so we can't reuse it.
function shouldRetry(error: APIError) {
  // Note this is not a standard header.
  const shouldRetryHeader = error.headers?.get("x-should-retry");

  if (shouldRetryHeader === "true") {
    return true;
  }
  if (shouldRetryHeader === "false") {
    return false;
  }

  if (!error.status) {
    return false;
  }

  // Retry on request timeouts.
  if (error.status === 408) {
    return true;
  }

  // Retry on lock timeouts.
  if (error.status === 409) {
    return true;
  }

  // Retry on rate limits.
  if (error.status === 429) {
    return true;
  }

  // Retry internal errors.
  return error.status >= 500;
}

// Yes, this is mainly duplicated between all providers. We know for sure each provider has a different error handling and http status code.
// So we want to be able to tweak this by provider
function categorizeAnthropicError(
  originalError: APIError,
  metadata: LLMClientMetadata
): LLMErrorInfo {
  const normalized = normalizeError(originalError);

  const statusCode = originalError.status ?? 500;
  const isRetryable = shouldRetry(originalError);

  // With eager_input_streaming enabled, the model may produce invalid tool parameter JSON.
  // The Anthropic API sometimes detects this server-side and aborts the stream with an SSE
  // error event (instead of reaching content_block_stop where we handle it client-side).
  // We mark this as retryable so the agent loop retries the full LLM call.
  if (
    originalError.type === "invalid_request_error" &&
    normalized.message.includes("Unable to parse tool parameter JSON")
  ) {
    return {
      type: "invalid_request_error",
      message: `Model generated invalid tool call JSON (${metadata.clientId}/${metadata.modelId}). ${normalized.message}`,
      isRetryable: true,
      originalError,
    };
  }

  if (originalError instanceof APIConnectionError) {
    return {
      type: "network_error",
      message: `Network error connecting to ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 400) {
    return {
      type: "invalid_request_error",
      message: `Invalid request to ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 401) {
    return {
      type: "authentication_error",
      message: `Authentication failed for ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 403) {
    return {
      type: "permission_error",
      message: `Permission denied for ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 404) {
    return {
      type: "not_found_error",
      message: `Resource not found for ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 422) {
    return {
      type: "invalid_request_error",
      message: `Invalid request to ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 429) {
    return {
      type: "rate_limit_error",
      message: `Rate limit exceeded for ${metadata.clientId}/${metadata.modelId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode === 503) {
    return {
      type: "overloaded_error",
      message: `Provider ${metadata.clientId} is overloaded. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  if (statusCode >= 500 && statusCode < 600) {
    return {
      type: "server_error",
      message: `Server error from ${metadata.clientId}. ${normalized.message}`,
      isRetryable,
      originalError,
    };
  }

  return {
    type: "unknown_error",
    message: `Unknown error from ${metadata.clientId}: ${normalized.message}`,
    isRetryable,
    originalError,
  };
}

/**
 * Type guard for an AnthropicError thrown by the SDK's BetaMessageStream when
 * it fails to parse tool parameter JSON client-side.
 */
export function isAnthropicErrorUnableToParseToolParam(
  err: unknown
): err is AnthropicError {
  return (
    err instanceof AnthropicError &&
    err.message.includes("Unable to parse tool parameter JSON")
  );
}

/**
 * Handles the SDK-thrown AnthropicError when BetaMessageStream fails to parse
 * tool parameter JSON client-side. Returns an EventError marked as retryable.
 */
export function handleInvalidToolJsonAnthropicError(
  err: AnthropicError,
  metadata: LLMClientMetadata
): LLMEvent {
  return new EventError(
    {
      type: "invalid_request_error",
      message: `Model generated invalid tool call JSON (${metadata.clientId}/${metadata.modelId}). ${err.message}`,
      isRetryable: true,
      originalError: err,
    },
    metadata
  );
}
