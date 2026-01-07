import type { TokenUsage, ToolCall } from "@app/lib/api/llm/types/events";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ReasoningEffort,
} from "@app/types";

/**
 * Context information for LLM operations to help debugging and discovery
 */
interface LLMTraceContextBase {
  /** Type of operation that triggered the LLM call */
  operationType:
    | "agent_builder_description_suggestion"
    | "agent_builder_emoji_suggestion"
    | "agent_builder_instruction_suggestion"
    | "agent_builder_name_suggestion"
    | "agent_builder_tags_suggestion"
    | "agent_conversation"
    | "agent_observability_summary"
    | "agent_suggestion"
    | "conversation_title_suggestion"
    | "process_data_sources"
    | "process_schema_generator"
    | "skill_builder_description_suggestion"
    | "skills_similarity_checker"
    | "trigger_cron_timezone_generator"
    | "trigger_webhook_filter_generator"
    | "voice_agent_finder"
    | "workspace_tags_suggestion";

  workspaceId?: string;
  /** User who triggered the operation */
  userId?: string;
}

export type LLMTraceContext = LLMTraceContextBase & {
  /** Additional context fields for tagging - MUST be camelCase (no underscores, starts lowercase) */
  [key: string]: string | undefined;
};

/**
 * Input parameters for an LLM call
 */
export interface LLMTraceInput {
  conversation: ModelConversationTypeMultiActions;
  modelId: ModelIdType;
  prompt: string;
  reasoningEffort: ReasoningEffort | null;
  responseFormat: string | null;
  specifications: unknown[];
  temperature: number | null;
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
  timeToFirstEventMs?: number;
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
  traceId: string;
  workspaceId: string;
  modelInteractionId?: string;
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
