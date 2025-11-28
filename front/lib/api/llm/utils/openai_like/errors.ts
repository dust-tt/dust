import type { APIError } from "openai";
import { APIConnectionError } from "openai";

import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { normalizeError } from "@app/types";

// https://github.com/openai/openai-node#handling-errors
export const handleError = (
  err: APIError,
  metadata: LLMClientMetadata
): LLMEvent => {
  return new EventError(categorizeOpenAILikeError(err, metadata), metadata);
};

// Based on openai.APIClient.shouldRetry
// The function is private so we can't reuse it.
function shouldRetry(error: APIError): boolean {
  // Note this is not a standard header.
  const shouldRetryHeader = error.headers?.get("x-should-retry");

  // If the server explicitly says whether or not to retry, obey.
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
function categorizeOpenAILikeError(
  originalError: APIError,
  metadata: LLMClientMetadata
): LLMErrorInfo {
  const normalized = normalizeError(originalError);
  const statusCode = originalError.status ?? 500;
  const isRetryable = shouldRetry(originalError);

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
