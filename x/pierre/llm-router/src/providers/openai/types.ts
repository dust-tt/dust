import { GPT_5_2_2025_12_11_MODEL_ID } from "@/providers/openai/models/gpt-5.2-2025-12-11";

export const OPENAI_PROVIDER_ID = "openai" as const;

export const OPENAI_MODEL_IDS = [GPT_5_2_2025_12_11_MODEL_ID] as const;
export type OpenAIModelId = (typeof OPENAI_MODEL_IDS)[number];

export type OpenAIModel = {
  providerId: typeof OPENAI_PROVIDER_ID;
  modelId: OpenAIModelId;
};

export type OpenAITextGeneratedMetadata = OpenAIModel & {
  itemId: string;
};
export type OpenAITextDeltaMetadata = OpenAIModel & {
  itemId: string;
};
export type OpenAIReasoningGeneratedMetadata = OpenAIModel & {
  itemId: string;
};
export type OpenAIReasoningDeltaMetadata = OpenAIModel & {
  itemId: { value: string };
};
export type OpenAIResponseIdMetadata = OpenAIModel & {
  createdAt: number;
  responseId: string;
};
export type OpenAICompletionMetadata = OpenAIModel & {
  createdAt: number;
  completedAt: number | undefined;
  responseId: string;
};

export type OpenAIToolCallRequestMetadata = OpenAIModel & {
  itemId: string;
  callId: string;
};

export type OpenAIToolCallDeltaMetadata = OpenAIModel & {
  itemId: string;
  callId: string;
};

export type OpenAIToolCallResultMetadata = OpenAIModel & {
  itemId: string;
  callId: string;
};
