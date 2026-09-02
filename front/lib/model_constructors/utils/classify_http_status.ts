import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ErrorSource,
  ErrorType,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Maps an HTTP status to fault domain and error type.
 * 4xx is Dust's request; 5xx is the provider; anything else is unknown.
 */
export function classifyHttpStatus(status: number | undefined): {
  errorSource: ErrorSource;
  type: ErrorType;
} {
  if (status === undefined) {
    return { errorSource: "unknown", type: "unknown_error" };
  }

  switch (status) {
    case 400:
    case 422:
      return { errorSource: "dust", type: "invalid_request_error" };
    case 401:
      return { errorSource: "dust", type: "authentication_error" };
    case 403:
      return { errorSource: "dust", type: "permission_error" };
    case 404:
      return { errorSource: "dust", type: "not_found_error" };
    case 429:
      return { errorSource: "dust", type: "rate_limit_error" };
    case 503:
      return { errorSource: "provider", type: "overloaded_error" };
    default:
      if (status >= 400 && status < 500) {
        return { errorSource: "dust", type: "invalid_request_error" };
      }
      if (status >= 500 && status < 600) {
        return { errorSource: "provider", type: "server_error" };
      }
      return { errorSource: "unknown", type: "unknown_error" };
  }
}

export function httpErrorMessage({
  type,
  provider,
  detail,
  status,
  model,
}: {
  type: ErrorType;
  provider: string;
  detail: string;
  status?: number;
  model?: string;
}): string {
  switch (type) {
    case "invalid_request_error":
      return `Invalid request to ${provider}: ${detail}`;
    case "authentication_error":
      return `Authentication failed for ${provider}: ${detail}`;
    case "permission_error":
      return `Permission denied for ${provider}: ${detail}`;
    case "not_found_error":
      return `Resource not found for ${provider}: ${detail}`;
    case "rate_limit_error":
      return model
        ? `Rate limit exceeded for ${provider}/${model}: ${detail}`
        : `Rate limit exceeded for ${provider}: ${detail}`;
    case "overloaded_error":
      return `${provider} is overloaded: ${detail}`;
    case "server_error":
      return status !== undefined
        ? `Server error from ${provider} (${status}): ${detail}`
        : `Server error from ${provider}: ${detail}`;
    case "unknown_error":
    case "input_configuration_error":
    case "stop_error":
    case "refusal_error":
    case "model_output_error":
    case "network_error":
    case "timeout_error":
    case "stream_error":
      return status !== undefined
        ? `Error from ${provider} (${status}): ${detail}`
        : `Error from ${provider}: ${detail}`;
    default:
      assertNever(type);
  }
}

export function buildHttpStatusErrorEvent({
  metadata,
  status,
  provider,
  detail,
  originalError,
}: {
  metadata: EndpointMetadata;
  status: number | undefined;
  provider: string;
  detail: string;
  originalError?: unknown;
}): ErrorEvent {
  const { errorSource, type } = classifyHttpStatus(status);
  return buildErrorEvent({
    errorSource,
    metadata,
    type,
    message: httpErrorMessage({
      type,
      provider,
      detail,
      status,
      model: metadata.model,
    }),
    originalError,
  });
}
