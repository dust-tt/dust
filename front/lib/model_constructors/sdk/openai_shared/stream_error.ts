import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { ErrorEvent } from "@app/lib/model_constructors/types/output/events";
import {
  classificationToErrorEvent,
  classifyStreamError,
  httpStatusToClassification,
} from "@app/lib/model_constructors/utils/classify_stream_error";
import { APIConnectionError, APIError, APIUserAbortError } from "openai";

// Shared by every adapter built on the `openai` SDK (Fireworks via chat
// completions, OpenAI/xAI/Fireworks via responses). The SDK error classes and
// the way a typed HTTP error exposes its status are identical; only the provider
// name differs, so it is passed in.
export function openaiStreamErrorToErrorEvent(
  metadata: EndpointMetadata,
  error: unknown,
  providerName: string
): ErrorEvent {
  // Abort and connection errors extend `APIError`, so they are checked first.
  // They only hint the code/name classifier, which decides attribution.
  if (error instanceof APIUserAbortError) {
    return classificationToErrorEvent(
      metadata,
      error,
      classifyStreamError({ error, providerName, sdkClass: "abort" })
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
    // A statusless `APIError` is how the SDK surfaces an SSE `error` payload — an
    // explicit provider-side failure, not a transport exception.
    return classificationToErrorEvent(
      metadata,
      error,
      httpStatusToClassification({
        providerName,
        model: metadata.model,
        status: error.status,
        statuslessServerError: true,
        detail: error.message,
      })
    );
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
