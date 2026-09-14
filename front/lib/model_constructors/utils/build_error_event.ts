import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ErrorSource,
  ErrorType,
} from "@app/lib/model_constructors/types/output/events";

export function buildErrorEvent({
  metadata,
  type,
  message,
  originalError,
  errorSource,
}: {
  metadata: EndpointMetadata;
  type: ErrorType;
  message: string;
  originalError?: unknown;
  errorSource: ErrorSource;
}): ErrorEvent {
  return {
    type: "error",
    content: { type, message, originalError, errorSource },
    metadata,
  };
}
