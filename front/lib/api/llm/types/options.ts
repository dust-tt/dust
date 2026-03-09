import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  LLMTraceContext,
  LLMTraceCustomization,
} from "@app/lib/api/llm/traces/types";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import { isString } from "@app/types/shared/utils/general";

export interface SystemPromptInstruction {
  role: "instruction";
  content: string;
}

export interface SystemPromptContext {
  role: "context";
  content: string;
}

/**
 * Structured system prompt with cache-tier ordering.
 *
 * - Context-only: `SystemPromptContext[]` is a flat array, most common case.
 * - Structured: named tiers ordered from most stable to most volatile. Provider clients might place
 * cache breakpoints between tiers to maximize prefix cache hits.
 *
 *   `instructions`     – stable per agent config (long cache TTL).
 *   `sharedContext`    – shared across calls with different callers (short cache).
 *   `ephemeralContext` – per-call data, varies every time (no breakpoint needed since it's the last
 *                        tier).
 */
export interface StructuredSystemPrompt {
  instructions: SystemPromptInstruction[];
  sharedContext: SystemPromptContext[];
  ephemeralContext: SystemPromptContext[];
}

export type SystemPromptSections =
  | SystemPromptContext[]
  | StructuredSystemPrompt;

/**
 * Plain strings are treated as context-only. Pass `SystemPromptSections` to
 * separate instructions from context.
 */
export type SystemPromptInput = string | SystemPromptSections;

function isStructured(
  sections: SystemPromptSections
): sections is StructuredSystemPrompt {
  return "instructions" in sections;
}

/**
 * Normalizes any prompt input into a `StructuredSystemPrompt`.
 *
 * - Plain string -> single shared-context block.
 * - Flat `SystemPromptContext[]` -> all items become shared context.
 * - `StructuredSystemPrompt` -> returned as-is.
 */
export function normalizePrompt(
  input: SystemPromptInput
): StructuredSystemPrompt {
  if (isString(input)) {
    return {
      instructions: [],
      sharedContext: [{ role: "context", content: input }],
      ephemeralContext: [],
    };
  }

  if (isStructured(input)) {
    return input;
  }

  return { instructions: [], sharedContext: input, ephemeralContext: [] };
}

// Joins all tiers into a flat string.
export function systemPromptToText(input: SystemPromptInput): string {
  if (isString(input)) {
    return input;
  }

  const { instructions, sharedContext, ephemeralContext } =
    normalizePrompt(input);

  return [...instructions, ...sharedContext, ...ephemeralContext]
    .map((s) => s.content.trim())
    .filter(Boolean)
    .join("\n");
}

export type LLMParameters = {
  bypassFeatureFlag?: boolean;
  context?: LLMTraceContext;
  modelId: ModelIdType;
  reasoningEffort?: ReasoningEffort | null;
  responseFormat?: string | null;
  metaData?: Record<string, unknown>;
  temperature?: number | null;
} & LLMTraceCustomization;

export type LLMClientMetadata = {
  clientId: ModelProviderIdType;
  modelId: ModelIdType;
};

export type ForceToolCall = string;

export interface LLMStreamParameters {
  conversation: ModelConversationTypeMultiActions;
  hasConditionalJITTools?: boolean;
  prompt: SystemPromptInput;
  specifications: AgentActionSpecification[];
  /**
   * Forces the model to use a specific tool. The tool name must match one of the
   * tools defined in the `specifications` array.
   */
  forceToolCall?: ForceToolCall;
}
