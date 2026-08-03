import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  ErrorEvent,
  ErrorType,
} from "@app/lib/model_constructors/types/output/events";

export function buildErrorEvent({
  metadata,
  type,
  message,
  originalError,
}: {
  metadata: EndpointMetadata;
  type: ErrorType;
  message: string;
  originalError?: unknown;
}): ErrorEvent {
  return {
    type: "error",
    content: { type, message, originalError },
    metadata,
  };
}
