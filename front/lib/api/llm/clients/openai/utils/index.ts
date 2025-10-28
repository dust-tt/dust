import type { AgentReasoningEffort, ModelConfigurationType } from "@app/types";
import {
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MINI_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

const OPENAI_MODEL_IDS = [
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MINI_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
];

const OPENAI_REASONING_MODEL_IDS = [
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MINI_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
];

export type OpenAIModelIdType = (typeof OPENAI_MODEL_IDS)[number];
export type OpenAIReasoningModelIdType =
  (typeof OPENAI_REASONING_MODEL_IDS)[number];

export type OpenAIPayload =
  | {
      model: ModelConfigurationType & {
        modelId: OpenAIReasoningModelIdType;
      };
      options?: {
        reasoningEffort?: AgentReasoningEffort;
        temperature?: undefined;
      };
    }
  | {
      model: ModelConfigurationType & {
        modelId: Exclude<OpenAIModelIdType, OpenAIReasoningModelIdType>;
      };
      options?: {
        reasoningEffort?: undefined;
        temperature?: number;
      };
    };
