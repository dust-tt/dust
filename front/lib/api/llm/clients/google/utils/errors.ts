import type { ApiError } from "@google/genai";

import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { normalizeError } from "@app/types";

// https://github.com/googleapis/js-genai#error-handling
export const handleError = (
  err: ApiError,
  metadata: LLMClientMetadata
): LLMEvent => {
  return new EventError(categorizeGenAIError(err, metadata), metadata);
};

// Yes, this is mainly duplicated between all providers. We know for sure each provider has a different error handling and http status code.
// So we want to be able to tweak this by provider
function categorizeGenAIError(
  error: ApiError,
  metadata: LLMClientMetadata
): LLMErrorInfo {
  const normalized = normalizeError(error);
  const statusCode = error.status;

  if (statusCode === 400) {
    return {
      type: "invalid_request_error",
      message: `Invalid request to ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      statusCode: statusCode ?? 400,
      originalError: error,
    };
  }

  if (statusCode === 401) {
    return {
      type: "authentication_error",
      message: `Authentication failed for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      statusCode: statusCode ?? 401,
      originalError: error,
    };
  }

  if (statusCode === 403) {
    return {
      type: "permission_error",
      message: `Permission denied for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      statusCode: statusCode ?? 403,
      originalError: error,
    };
  }

  if (statusCode === 404) {
    return {
      type: "not_found_error",
      message: `Resource not found for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      statusCode: statusCode ?? 404,
      originalError: error,
    };
  }

  if (statusCode === 429) {
    return {
      type: "rate_limit_error",
      message: `Rate limit exceeded for ${metadata.clientId}/${metadata.modelId}. ${normalized.message}`,
      isRetryable: true,
      statusCode: statusCode ?? 429,
      originalError: error,
    };
  }

  if (statusCode >= 500 && statusCode < 600) {
    return {
      type: "server_error",
      message: `Server error from ${metadata.clientId}. ${normalized.message}`,
      isRetryable: true,
      statusCode: statusCode ?? 500,
      originalError: error,
    };
  }

  return {
    type: "unknown_error",
    message: `Unknown error from ${metadata.clientId}: ${normalized.message}`,
    isRetryable: false,
    statusCode: statusCode ?? 500,
    originalError: error,
  };
}
