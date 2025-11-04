import type { OpenAIModelFamily } from "@app/lib/api/llm/clients/openai/types";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType } from "@app/types";
import { GPT_5_MINI_MODEL_ID } from "@app/types";

export const MODEL_IDS_TO_TEST: Record<
  OpenAIModelFamily,
  { modelIds: ModelIdType[]; testConfigs: LLMParameters[] }
> = {
  o3: { modelIds: [], testConfigs: [] },
  reasoning: { modelIds: [], testConfigs: [] },
  "non-reasoning": { modelIds: [GPT_5_MINI_MODEL_ID], testConfigs: [] },
};

export const PERMISSIVE_TEST_CONFIGS = [
  {
    temperature: 0.5,
    reasoningEffort: "none",
  },
  {
    temperature: 1,
    reasoningEffort: "light",
  },
  {
    temperature: 0.5,
    reasoningEffort: "medium",
  },
  {
    temperature: 1,
    reasoningEffort: "high",
  },
] as const;
