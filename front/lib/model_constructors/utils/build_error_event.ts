import type { AgentMetadata } from "@app/lib/model_constructors/types/agent_metadata";
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
  metadata: AgentMetadata;
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
