import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type {
  LLMTraceContext,
  LLMTraceCustomization,
} from "@app/lib/api/llm/traces/types";
import type {
  ModelConversationTypeMultiActions,
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffort,
} from "@app/types";
import { isString } from "@app/types";

export interface SystemPromptInstruction {
  role: "instruction";
  content: string;
}

export interface SystemPromptContext {
  role: "context";
  content: string;
}

/**
 * Structured system prompt with type-enforced ordering.
 *
 * - Context-only: `SystemPromptContext[]` - flat array, most common case
 * - With instructions: `[SystemPromptInstruction[], SystemPromptContext[]]` - tuple
 *   guaranteeing instructions come before context
 *
 * Provider clients may map each tuple position to a separate system block for caching.
 */
export type SystemPromptSections =
  | SystemPromptContext[]
  | [SystemPromptInstruction[], SystemPromptContext[]];

/**
 * Plain strings are treated as context-only. Pass `SystemPromptSections` to
 * separate instructions from context.
 */
export type SystemPromptInput = string | SystemPromptSections;

// Checks whether sections use the [instructions, context] tuple form.
function isTupleForm(
  sections: SystemPromptSections
): sections is [SystemPromptInstruction[], SystemPromptContext[]] {
  return sections.length > 0 && Array.isArray(sections[0]);
}

// Normalizes prompt input into [instructions, context] tuple form.
export function normalizePrompt(
  input: SystemPromptInput
): [SystemPromptInstruction[], SystemPromptContext[]] {
  if (isString(input)) {
    return [[], [{ role: "context", content: input }]];
  }

  if (isTupleForm(input)) {
    return input;
  }

  return [[], input];
}

// Joins all sections into a flat string.
export function systemPromptToText(input: SystemPromptInput): string {
  if (isString(input)) {
    return input;
  }

  const [instructions, context] = normalizePrompt(input);

  return [...instructions, ...context]
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
  temperature?: number | null;
} & LLMTraceCustomization;

export type LLMClientMetadata = {
  clientId: ModelProviderIdType;
  modelId: ModelIdType;
};

export type ForceToolCall = string;

export interface LLMStreamParameters {
  conversation: ModelConversationTypeMultiActions;
  prompt: SystemPromptInput;
  specifications: AgentActionSpecification[];
  /**
   * Forces the model to use a specific tool. The tool name must match one of the
   * tools defined in the `specifications` array.
   */
  forceToolCall?: ForceToolCall;
}
