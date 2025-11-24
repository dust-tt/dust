import flatMap from "lodash/flatMap";
import type {
  ResponseCreateParamsStreaming,
  ResponseIncludable,
} from "openai/resources/responses/responses";
import type { ReasoningEffort as OpenAIReasoningEffort } from "openai/resources/shared";

import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { ModelIdType, ReasoningEffort } from "@app/types";
import {
  ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES,
  GPT_3_5_TURBO_MODEL_ID,
  GPT_4_1_MINI_MODEL_ID,
  GPT_4_1_MODEL_ID,
  GPT_4_TURBO_MODEL_ID,
  GPT_4O_20240806_MODEL_ID,
  GPT_4O_MINI_MODEL_ID,
  GPT_4O_MODEL_ID,
  GPT_5_1_MODEL_ID,
  GPT_5_MINI_MODEL_ID,
  GPT_5_MODEL_ID,
  GPT_5_NANO_MODEL_ID,
  O1_MODEL_ID,
  O3_MINI_MODEL_ID,
  O3_MODEL_ID,
  O4_MINI_MODEL_ID,
} from "@app/types";

export type ModelConfig = {
  modelIds: ModelIdType[];
  overwrites?: Partial<LLMParameters & { modelId: never }>;
  defaults?: Partial<Exclude<LLMParameters, "modelId">>;
  inputDefaults?: Partial<ResponseCreateParamsStreaming>;
  include?: ResponseIncludable[];
  reasoningEffortMappingOverwrites?: Partial<
    Record<ReasoningEffort, OpenAIReasoningEffort>
  >;
};

export const OPENAI_MODEL_FAMILY_CONFIGS = {
  o3: {
    modelIds: [O3_MODEL_ID],
    overwrites: { temperature: null },
    defaults: { reasoningEffort: "medium" },
    inputDefaults: { include: ["reasoning.encrypted_content"] },
  },
  "o3-no-vision": {
    modelIds: [O3_MINI_MODEL_ID],
    overwrites: { temperature: null },
    defaults: { reasoningEffort: "medium" },
    inputDefaults: { include: ["reasoning.encrypted_content"] },
  },
  reasoning: {
    modelIds: [O1_MODEL_ID, O4_MINI_MODEL_ID],
    overwrites: { temperature: null },
    // For reasoning, setting to null defaults to medium
    // So we should make sure to enforce a default value
    // To avoid unexpected behaviors
    defaults: { reasoningEffort: "medium" },
    inputDefaults: { include: ["reasoning.encrypted_content"] },
  },
  "gpt-5": {
    modelIds: [GPT_5_MODEL_ID, GPT_5_MINI_MODEL_ID, GPT_5_NANO_MODEL_ID],
    overwrites: { temperature: null },
    defaults: { reasoningEffort: "medium" },
    inputDefaults: { include: ["reasoning.encrypted_content"] },
    reasoningEffortMappingOverwrites: { none: "minimal" },
  },
  "gpt-5.1": {
    modelIds: [GPT_5_1_MODEL_ID],
    overwrites: { temperature: null },
    inputDefaults: { include: ["reasoning.encrypted_content"] },
    defaults: { reasoningEffort: "medium" },
  },
  "non-reasoning": {
    modelIds: [
      GPT_4_TURBO_MODEL_ID,
      GPT_4O_MODEL_ID,
      GPT_4O_MINI_MODEL_ID,
      GPT_4_1_MODEL_ID,
      GPT_4_1_MINI_MODEL_ID,
      GPT_4O_20240806_MODEL_ID,
    ],
    overwrites: { reasoningEffort: null },
    defaults: { temperature: ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES.balanced },
  },
  "no-vision": {
    modelIds: [GPT_3_5_TURBO_MODEL_ID],
    overwrites: { reasoningEffort: null },
    defaults: { temperature: ASSISTANT_CREATIVITY_LEVEL_TEMPERATURES.balanced },
  },
} as const satisfies Record<OpenAIModelFamily, ModelConfig>;

export const OPENAI_MODEL_FAMILIES = [
  "o3",
  "o3-no-vision",
  "no-vision",
  "non-reasoning",
  "reasoning",
  "gpt-5",
  "gpt-5.1",
] as const;
export type OpenAIModelFamily = (typeof OPENAI_MODEL_FAMILIES)[number];

export type OpenAIWhitelistedModelId = {
  [K in OpenAIModelFamily]: (typeof OPENAI_MODEL_FAMILY_CONFIGS)[K]["modelIds"][number];
}[OpenAIModelFamily];
export const OPENAI_WHITELISTED_MODEL_IDS = flatMap<OpenAIWhitelistedModelId>(
  Object.values(OPENAI_MODEL_FAMILY_CONFIGS).map((config) => config.modelIds)
);

export const DEFAULT_REASONING_EFFORT_MAPPING: {
  [key in ReasoningEffort]: OpenAIReasoningEffort;
} = {
  none: "none",
  light: "low",
  medium: "medium",
  high: "high",
};
