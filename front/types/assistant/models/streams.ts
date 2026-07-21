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

// Streams are curated, auto-routing tiers of the model picker (like "Auto", but
// scoped to a hand-picked pool). Each stream is a sentinel model (mirroring the
// "auto" sentinel): the picker sends the sentinel, and the backend routes to the
// first available model in the stream's ordered pool at message-send time.
export const QUICK_MODEL_ID = "quick" as const;
export const DEEP_MODEL_ID = "deep" as const;

export const MODEL_STREAM_IDS = [QUICK_MODEL_ID, DEEP_MODEL_ID] as const;
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
    [QUICK_MODEL_ID]: [
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
    [DEEP_MODEL_ID]: [
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

// Everything below mirrors AUTO_MODEL_CONFIG: values are placeholders to satisfy
// ModelConfigurationType, since a stream sentinel is dynamically routed to a real
// model before it is ever used to run a completion.
function makeStreamModelConfig(
  streamId: ModelStreamIdType,
  {
    displayName,
    shortDescription,
  }: { displayName: string; shortDescription: string }
): ModelConfigurationType {
  return {
    providerId: streamId,
    modelId: streamId,
    displayName,
    description: shortDescription,
    shortDescription,
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

export const QUICK_MODEL_CONFIG: ModelConfigurationType = makeStreamModelConfig(
  QUICK_MODEL_ID,
  {
    displayName: "Quick",
    shortDescription: "Fast models for simple tasks.",
  }
);

export const DEEP_MODEL_CONFIG: ModelConfigurationType = makeStreamModelConfig(
  DEEP_MODEL_ID,
  {
    displayName: "Deep",
    shortDescription: "Powerful models for heavy tasks.",
  }
);
