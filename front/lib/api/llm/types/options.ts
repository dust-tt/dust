import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { InferenceRegionType } from "@app/lib/api/assistant/token_pricing";
import type {
  LLMTraceContext,
  LLMTraceCustomization,
} from "@app/lib/api/llm/traces/types";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { ModelConversationTypeMultiActions } from "@app/types/assistant/generation";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import { isString } from "@app/types/shared/utils/general";

export type { InferenceRegionType };

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
  credentials: LLMCredentialsType;
  modelId: ModelIdType;
  reasoningEffort?: ReasoningEffort | null;
  responseFormat?: string | null;
  metaData?: Record<string, unknown>;
  temperature?: number | null;
  omittedThinking?: boolean;
} & LLMTraceCustomization;

export type LLMParameterOverwrites = Partial<
  Omit<LLMParameters, "modelId" | "credentials">
>;

export type LLMClientMetadata = {
  clientId: ModelProviderIdType;
  // Holds the inference provider for legacy clients (e.g. "google_vertex_ai")
  // and the new router's `providerApi` value (e.g. "agent-platform").
  inferenceProvider: string;
  inferenceRegion: InferenceRegionType;
  region?: Region;
  modelId: ModelIdType;
};

export type ForceToolCall = string;

// A forced tool call and forbidden tool use are contradictory instructions, so
// the type makes them mutually exclusive: setting both is a compile error.
export type ExclusiveToolChoiceParameters =
  | {
      /**
       * Forces the model to use a specific tool. The tool name must match one of the tools defined
       * in the `specifications` array.
       */
      forceToolCall?: ForceToolCall;
      disableToolUse?: never;
    }
  | {
      forceToolCall?: never;
      /**
       * Presents the tools to the model but forbids calling them (tool choice "none"). Used on the
       * last agent step to force a final generation while keeping the request's tool definitions
       * stable across steps.
       */
      disableToolUse?: boolean;
    };

interface LLMStreamParametersBase {
  conversation: ModelConversationTypeMultiActions;
  hasConditionalJITTools?: boolean;
  // When true, the Anthropic clients defer non-eager tools behind tool search.
  // Other provider clients ignore it.
  toolSearchEnabled?: boolean;
  prompt: SystemPromptInput;
  specifications: AgentActionSpecification[];
  omittedThinking?: boolean;
  /**
   * Opt into Anthropic prompt-cache diagnostics (Anthropic direct only). Tri-state:
   * - `undefined`: feature off, send nothing.
   * - `null`: feature on, first call with no prior to compare against.
   * - `string`: feature on, the previous response id to compare this request against.
   */
  previousMessageId?: string | null;
}

export type LLMStreamParameters = LLMStreamParametersBase &
  ExclusiveToolChoiceParameters;

export interface LLMStreamMetadata {
  conversationId: string;
}

// Omit the base fields only and re-intersect the tool-choice union: a plain
// Omit over the union would flatten it and lose the mutual exclusivity of
// `forceToolCall` and `disableToolUse`.
export type LLMParametersWithoutConversation = Omit<
  LLMStreamParametersBase,
  "conversation"
> &
  ExclusiveToolChoiceParameters;
