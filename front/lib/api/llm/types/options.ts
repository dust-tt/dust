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

export type SystemPromptRole = "instructions" | "context";

export interface SystemPromptSection {
  role: SystemPromptRole;
  content: string;
}

/**
 * Prompt accepted by the LLM stream interface.
 *
 * Plain strings are treated as a single "context" section.
 * Pass `SystemPromptSection[]` to control caching tiers explicitly.
 */
export type SystemPromptInput = string | SystemPromptSection[];

// Normalizes a prompt input into structured sections.
export function normalizePrompt(
  input: SystemPromptInput
): SystemPromptSection[] {
  if (isString(input)) {
    return [{ role: "context", content: input }];
  }

  return input;
}

// Joins sections into a flat string for callers that don't need structure.
export function systemPromptToText(input: SystemPromptInput): string {
  if (isString(input)) {
    return input;
  }

  return input
    .map((s) => s.content.trim())
    .filter(Boolean)
    .join("\n");
}

/**
 * Wraps a static instruction string into a prompt section with role "instructions".
 *
 * Use this for prompts that are fully static (no PII, no per-request data like
 * user names or timestamps). These get long-TTL caching on providers that support it.
 *
 * For prompts containing dynamic/per-request data, use role "context" explicitly.
 */
export function textToStaticInstructions(text: string): SystemPromptSection[] {
  return [{ role: "instructions", content: text }];
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
