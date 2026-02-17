import { CLAUDE_SONNET_4_5_20250929_MODEL_ID } from "@/providers/anthropic/models/claude-sonnet-4-5-20250929";

export const ANTHROPIC_PROVIDER_ID = "anthropic" as const;

export const ANTHROPIC_MODEL_IDS = [
  CLAUDE_SONNET_4_5_20250929_MODEL_ID,
] as const;
export type AnthropicModelId = (typeof ANTHROPIC_MODEL_IDS)[number];

export type AnthropicModel = {
  providerId: typeof ANTHROPIC_PROVIDER_ID;
  modelId: AnthropicModelId;
};

export type AnthropicTextGeneratedMetadata = AnthropicModel;

export type AnthropicTextDeltaMetadata = AnthropicModel & {
  activeBlocks?: Map<
    number,
    {
      index: number;
      type: "text" | "tool_use";
      toolUseId?: string;
      toolName?: string;
      accumulatedJson?: string;
    }
  >;
};

export type AnthropicReasoningGeneratedMetadata = AnthropicModel;

export type AnthropicReasoningDeltaMetadata = AnthropicModel;

export type AnthropicResponseIdMetadata = AnthropicModel;

export type AnthropicCompletionMetadata = AnthropicModel;

export type AnthropicToolCallRequestMetadata = AnthropicModel & {
  callId: string;
};

export type AnthropicToolCallDeltaMetadata = AnthropicModel;

export type AnthropicToolCallResultMetadata = AnthropicModel & {
  callId: string;
};

export type AnthropicToolCallGeneratedMetadata = AnthropicModel & {
  callId: string;
};
