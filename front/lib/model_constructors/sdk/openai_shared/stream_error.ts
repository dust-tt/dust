import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { buildHttpStatusErrorEvent } from "@app/lib/model_constructors/utils/classify_http_status";
import { classifyStreamError } from "@app/lib/model_constructors/utils/classify_stream_error";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";

export function isFlexUnavailableError(error: unknown): error is APIError {
  return error instanceof APIError && error.code === "flex_unavailable";
}

// Shared by every adapter built on the `openai` SDK (Fireworks via chat
// completions, OpenAI/xAI/Fireworks via responses). The SDK error classes and
// the way a typed HTTP error exposes its status are identical; only the provider
// name differs, so it is passed in.
/**
 * @cc [owner:philipperolet,label:error-handling] flex-unavailable-is-capacity-refusal
 * `flex_unavailable` API errors MUST map to a Dust-attributed `rate_limit_error`, including
 * statusless SSE errors, so expected flex capacity refusals do not count as provider failures.
 */
export function openaiStreamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown,
  providerName: string
): ErrorEvent {
  // Abort, timeout, and connection errors all extend `APIError`, so they are
  // checked first. `APIConnectionTimeoutError` extends `APIConnectionError`, so
  // it must be checked before it. They only hint the code/name classifier, which
  // decides the final type and attribution.
  if (error instanceof APIUserAbortError) {
    return classifyStreamError({
      error,
      metadata,
      providerName,
      sdkClass: "abort",
    });
  }
  if (error instanceof APIConnectionTimeoutError) {
    return classifyStreamError({
      error,
      metadata,
      providerName,
      sdkClass: "timeout",
    });
  }
  if (error instanceof APIConnectionError) {
    return classifyStreamError({
      error,
      metadata,
      providerName,
      sdkClass: "connection",
    });
  }
  if (error instanceof APIError) {
    // A statusless `APIError` is how the SDK surfaces an in-band SSE `error`
    // payload. That can be a permanent request or model error, not only a
    // transient provider outage, so we attribute it to the provider but leave it
    // as a non-retryable `unknown_error` rather than a retryable `server_error`.
    // We do not inspect free-form message text to upgrade it.
    if (error.status === undefined && !isFlexUnavailableError(error)) {
      return buildErrorEvent({
        errorSource: "provider",
        metadata,
        type: "unknown_error",
        message: `Error from ${providerName}: ${error.message}`,
        originalError: error,
      });
    }
    return buildHttpStatusErrorEvent({
      metadata,
      status: isFlexUnavailableError(error) ? 429 : error.status,
      provider: providerName,
      detail: error.message,
      originalError: error,
    });
  }
  return classifyStreamError({ error, metadata, providerName });
}
