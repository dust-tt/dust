import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import { buildHttpStatusErrorEvent } from "@app/lib/model_constructors/utils/classify_http_status";
import {
  classificationToErrorEvent,
  classifyStreamError,
} from "@app/lib/model_constructors/utils/classify_stream_error";
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";

// Shared by every adapter built on the `openai` SDK (Fireworks via chat
// completions, OpenAI/xAI/Fireworks via responses). The SDK error classes and
// the way a typed HTTP error exposes its status are identical; only the provider
// name differs, so it is passed in.
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
    return classificationToErrorEvent(
      metadata,
      error,
      classifyStreamError({ error, providerName, sdkClass: "abort" })
    );
  }
  if (error instanceof APIConnectionTimeoutError) {
    return classificationToErrorEvent(
      metadata,
      error,
      classifyStreamError({ error, providerName, sdkClass: "timeout" })
    );
  }
  if (error instanceof APIConnectionError) {
    return classificationToErrorEvent(
      metadata,
      error,
      classifyStreamError({ error, providerName, sdkClass: "connection" })
    );
  }
  if (error instanceof APIError) {
    // A statusless `APIError` is how the SDK surfaces an in-band SSE `error`
    // payload. That can be a permanent request or model error, not only a
    // transient provider outage, so we attribute it to the provider but leave it
    // as a non-retryable `unknown_error` rather than a retryable `server_error`.
    // We do not inspect free-form message text to upgrade it.
    if (error.status === undefined) {
      return classificationToErrorEvent(metadata, error, {
        errorSource: "provider",
        type: "unknown_error",
        message: `Error from ${providerName}: ${error.message}`,
      });
    }
    return buildHttpStatusErrorEvent({
      metadata,
      status: error.status,
      provider: providerName,
      detail: error.message,
      originalError: error,
    });
  }
  return classificationToErrorEvent(
    metadata,
    error,
    classifyStreamError({ error, providerName })
  );
}

// OpenAI-family adapters serve more than one host. Attribute the error to the
// host actually in use so a Fireworks or xAI failure is not labelled "OpenAI".
export function openaiProviderNameForHost(
  host: EndpointMetadata["host"]
): string {
  switch (host) {
    case "fireworks":
      return "Fireworks";
    case "xai":
      return "xAI";
    default:
      return "OpenAI";
  }
}
