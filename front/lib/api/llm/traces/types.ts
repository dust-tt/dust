import type { TokenUsage, ToolCall } from "@app/lib/api/llm/types/events";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffort,
} from "@app/types";

/**
 * Context information for LLM operations to aid in debugging and discovery
 */
export interface LLMTraceContext {
  /** Type of operation that triggered the LLM call */
  operationType:
    | "agent_conversation"
    | "builder_suggestion"
    | "agent_preview"
    | "name_suggestion"
    | "other";

  /** Context-specific identifier (e.g., agentConfigId, userId, etc.) */
  contextId?: string;

  /** User who triggered the operation */
  userId?: string;
}

/**
 * Input parameters for an LLM call
 */
export interface LLMTraceInput {
  conversation: ModelConversationTypeMultiActions;
  model: ModelIdType;
  prompt: string;
  reasoningEffort: ReasoningEffort;
  specifications: unknown[];
  temperature: number;
}

/**
 * Output from an LLM call
 */
export interface LLMTraceOutput {
  content?: string;
  toolCalls?: Array<ToolCall>;
  /** Reasoning content (for models that support it) */
  reasoning?: string;
  // TODO(2025-10-31 DIRECT_LLM): Refine finishReason type based on LLM providers' specs.
  finishReason?: string | "unknown";
  tokenUsage?: TokenUsage;
}

/**
 * Error information for failed LLM operations
 */
interface LLMTraceError {
  message: string;
  timestamp: string;
  /** Whether the stream had partial completion before failing */
  partialCompletion: boolean;

  // TODO(2025-10-31 DIRECT_LLM): Wire the runId from the LLM provider.
  providerRunId?: string;
}

/**
 * Metadata about the LLM operation
 */
interface LLMTraceMetadata {
  /** Whether the trace buffer was truncated due to size limits */
  bufferTruncated?: boolean;
  /** Total bytes captured in the buffer */
  capturedBytes?: number;
  durationMs: number;
  endTimestamp?: string;
  modelId: ModelIdType;
  startTimestamp: string;
  /** Reason for truncation if applicable */
  truncationReason?: string;
}

/**
 * Complete trace data for an LLM operation
 */
export interface LLMTrace {
  /** Unique identifier for this trace (format: llm_${uuid}) */
  context: LLMTraceContext;
  error?: LLMTraceError;
  input: LLMTraceInput;
  metadata: LLMTraceMetadata;
  output?: LLMTraceOutput;
  runId: string;
  workspaceId: string;
}

/**
 * Utility type for extracting output from LLM events
 */
export interface ProcessedLLMEvents {
  content: string;
  finishReason: LLMTraceOutput["finishReason"];
  reasoning: string;
  tokenUsage?: LLMTraceOutput["tokenUsage"];
  toolCalls: Array<ToolCall>;
}
