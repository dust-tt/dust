import {
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "./anthropic";
import {
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
} from "./google_ai_studio";
import { MISTRAL_LARGE_MODEL_ID, MISTRAL_SMALL_MODEL_ID } from "./mistral";
import { GPT_5_6_LUNA_MODEL_ID, GPT_5_6_SOL_MODEL_ID } from "./openai";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningEffort,
} from "./types";

// Auto-routing meta-models: sentinels that do not name a concrete model but are
// resolved to one at message-send time. `auto` lets Dust pick any available
// model; `auto_fast` / `auto_complex` route among a curated pool (a "stream").
// Both the provider id and the model id of a meta-model are the sentinel string.
export const AUTO_MODEL_ID = "auto" as const;
export const AUTO_FAST_MODEL_ID = "auto_fast" as const;
export const AUTO_COMPLEX_MODEL_ID = "auto_complex" as const;

export const META_MODEL_IDS = [
  AUTO_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_COMPLEX_MODEL_ID,
] as const;
export type MetaModelIdType = (typeof META_MODEL_IDS)[number];

export function isMetaModelId(modelId: string): modelId is MetaModelIdType {
  return META_MODEL_IDS.includes(modelId as MetaModelIdType);
}

// The stream meta-models (everything except plain `auto`): they route among a
// curated, ordered pool of concrete models rather than the whole catalog.
export const MODEL_STREAM_IDS = [
  AUTO_FAST_MODEL_ID,
  AUTO_COMPLEX_MODEL_ID,
] as const;
export type ModelStreamIdType = (typeof MODEL_STREAM_IDS)[number];

export function isModelStreamId(modelId: string): modelId is ModelStreamIdType {
  return MODEL_STREAM_IDS.includes(modelId as ModelStreamIdType);
}

// One candidate of a stream: a concrete model + the reasoning effort to run it
// at. Ordered by preference — the router picks the first candidate available to
// the workspace.
export interface ModelStreamCandidate {
  providerId: ModelProviderIdType;
  modelId: string;
  reasoningEffort: ReasoningEffort;
}

export const MODEL_STREAMS: Record<ModelStreamIdType, ModelStreamCandidate[]> =
  {
    [AUTO_FAST_MODEL_ID]: [
      {
        providerId: "openai",
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        providerId: "google_ai_studio",
        modelId: GEMINI_3_1_FLASH_LITE_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        providerId: "mistral",
        modelId: MISTRAL_SMALL_MODEL_ID,
        reasoningEffort: "none",
      },
    ],
    [AUTO_COMPLEX_MODEL_ID]: [
      {
        providerId: "anthropic",
        modelId: CLAUDE_OPUS_4_8_MODEL_ID,
        reasoningEffort: "high",
      },
      {
        providerId: "openai",
        modelId: GPT_5_6_SOL_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        providerId: "google_ai_studio",
        modelId: GEMINI_3_1_PRO_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        providerId: "mistral",
        modelId: MISTRAL_LARGE_MODEL_ID,
        reasoningEffort: "none",
      },
    ],
  };

// All fields other than the ids are placeholders to satisfy
// ModelConfigurationType: a meta-model is dynamically routed to a real model
// before it is ever used to run a completion.
function makeMetaModelConfig(
  id: MetaModelIdType,
  { displayName, description }: { displayName: string; description: string }
): ModelConfigurationType {
  return {
    providerId: id,
    modelId: id,
    displayName,
    description,
    shortDescription: description,
    contextSize: 1_000_000,
    recommendedTopK: 64,
    recommendedExhaustiveTopK: 64,
    largeModel: true,
    isLegacy: false,
    isLatest: true,
    generationTokensCount: 64_000,
    supportsVision: false,
    supportedReasoningEfforts: {
      none: true,
      light: false,
      medium: false,
      high: false,
    },
    defaultReasoningEffort: "none",
    supportsResponseFormat: false,
    availableIfOneOf: {
      featureFlag: "models_picker",
    },
    tokenizer: { type: "tiktoken", base: "o200k_base" },
    regionalAvailability: {
      "us-central1": true,
      "europe-west1": true,
    },
  };
}

export const AUTO_MODEL_CONFIG: ModelConfigurationType = makeMetaModelConfig(
  AUTO_MODEL_ID,
  {
    displayName: "Auto",
    description: "Let's Dust select the best model for the task.",
  }
);

export const AUTO_FAST_MODEL_CONFIG: ModelConfigurationType =
  makeMetaModelConfig(AUTO_FAST_MODEL_ID, {
    displayName: "Fast",
    description: "Fast models for simple tasks.",
  });

export const AUTO_COMPLEX_MODEL_CONFIG: ModelConfigurationType =
  makeMetaModelConfig(AUTO_COMPLEX_MODEL_ID, {
    displayName: "Complex",
    description: "Powerful models for heavy tasks.",
  });
