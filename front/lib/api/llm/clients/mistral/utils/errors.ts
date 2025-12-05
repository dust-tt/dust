import type { MistralError } from "@mistralai/mistralai/models/errors/mistralerror";

import type { LLMErrorInfo } from "@app/lib/api/llm/types/errors";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { EventError } from "@app/lib/api/llm/types/events";
import type { LLMClientMetadata } from "@app/lib/api/llm/types/options";
import { normalizeError } from "@app/types";

// https://github.com/mistralai/client-ts#error-handling
export const handleError = (
  err: MistralError,
  metadata: LLMClientMetadata
): LLMEvent => {
  return new EventError(categorizeMistralError(err, metadata), metadata);
};

// Yes, this is mainly duplicated between all providers. We know for sure each provider has a different error handling and http status code.
// So we want to be able to tweak this by provider
// No specific error handling in Mistral's code
function categorizeMistralError(
  originalError: MistralError,
  metadata: LLMClientMetadata
): LLMErrorInfo {
  const normalized = normalizeError(originalError);
  const statusCode = originalError.statusCode;

  if (statusCode === 400) {
    return {
      type: "invalid_request_error",
      message: `Invalid request to ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
    };
  }

  if (statusCode === 401) {
    return {
      type: "authentication_error",
      message: `Authentication failed for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError,
    };
  }

  if (statusCode === 403) {
    return {
      type: "permission_error",
      message: `Permission denied for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError,
    };
  }

  if (statusCode === 404) {
    return {
      type: "not_found_error",
      message: `Resource not found for ${metadata.clientId}. ${normalized.message}`,
      isRetryable: false,
      originalError,
    };
  }

  if (statusCode === 429) {
    return {
      type: "rate_limit_error",
      message: `Rate limit exceeded for ${metadata.clientId}/${metadata.modelId}. ${normalized.message}`,
      isRetryable: true,
      originalError,
    };
  }

  if (statusCode >= 500 && statusCode < 600) {
    return {
      type: "server_error",
      message: `Server error from ${metadata.clientId}. ${normalized.message}`,
      isRetryable: true,
      originalError,
    };
  }

  return {
    type: "unknown_error",
    message: `Unknown error from ${metadata.clientId}: ${normalized.message}`,
    isRetryable: false,
    originalError,
  };
}
