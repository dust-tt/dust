import {
  CLAUDE_OPUS_4_8_MODEL_ID,
  CLAUDE_OPUS_5_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
} from "./anthropic";
import {
  GEMINI_3_1_FLASH_LITE_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GEMINI_3_7_FLASH_MODEL_ID,
} from "./google_ai_studio";
import {
  MISTRAL_LARGE_MODEL_ID,
  MISTRAL_MEDIUM_3_5_MODEL_ID,
  MISTRAL_SMALL_MODEL_ID,
} from "./mistral";
import { GPT_5_6_LUNA_MODEL_ID, GPT_5_6_SOL_MODEL_ID } from "./openai";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  ReasoningEffort,
  ResolvedRequestedModel,
} from "./types";
import { GROK_3_MINI_MODEL_ID, GROK_4_6_MODEL_ID } from "./xai";

// Auto-routing meta-models: sentinels that never name a concrete model but are
// resolved to one at message-send time by walking an ordered candidate pool (a
// "stream") and picking the first candidate available to the workspace.
export const AUTO_MODEL_ID = "auto" as const;
export const AUTO_FAST_MODEL_ID = "auto_fast" as const;
export const AUTO_COMPLEX_MODEL_ID = "auto_complex" as const;

export const MODEL_STREAM_IDS = [
  AUTO_MODEL_ID,
  AUTO_FAST_MODEL_ID,
  AUTO_COMPLEX_MODEL_ID,
] as const;
export type ModelStreamIdType = (typeof MODEL_STREAM_IDS)[number];

export function isModelStreamId(modelId: string): modelId is ModelStreamIdType {
  return MODEL_STREAM_IDS.includes(modelId as ModelStreamIdType);
}

// Model that each (agent, stream) pair of a conversation last resolved to, keyed by
// `makeStreamModelResolutionKey`. Denormalized on the conversation row so reading it costs no
// query: every caller that resolves a model already holds the conversation. Entries are hints —
// the resolver only honors one while it is still part of the stream and still available to the
// workspace. Bounded by the agents used in the conversation times the number of streams.
export type StreamModelResolutions = Record<string, ResolvedRequestedModel>;

// Scoped to one agent and one stream: a Premium turn must not inherit what Standard picked, and
// two agents in the same conversation each keep their own resolution. Agent sIds never contain a
// colon, so the two parts cannot collide.
export function makeStreamModelResolutionKey(
  agentConfigurationId: string,
  streamId: ModelStreamIdType
): string {
  return `${agentConfigurationId}:${streamId}`;
}

// One candidate of a stream: a concrete model + the reasoning effort to run it
// at. Ordered by preference — the router picks the first candidate available to
// the workspace. Efforts default to each model's own default; they are only
// overridden when a stream deliberately wants a different effort (e.g. `light`
// for the Basic stream, `high` for the Premium stream).
export interface ModelStreamCandidate {
  providerId: ModelProviderIdType;
  modelId: string;
  reasoningEffort: ReasoningEffort;
}

export const MODEL_STREAMS: Record<ModelStreamIdType, ModelStreamCandidate[]> =
  {
    // Plain `auto` spans the whole preferred catalog at each model's default
    // reasoning effort. The last candidate (Sonnet at `light`) is the Basic-tier
    // floor so tier-capped users still resolve within the stream.
    [AUTO_MODEL_ID]: [
      {
        providerId: "openai",
        modelId: GPT_5_6_LUNA_MODEL_ID,
        reasoningEffort: "high",
      },
      {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        providerId: "google_ai_studio",
        modelId: GEMINI_3_1_PRO_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        providerId: "google_ai_studio",
        modelId: GEMINI_3_1_FLASH_LITE_MODEL_ID,
        reasoningEffort: "light",
      },
      {
        providerId: "mistral",
        modelId: MISTRAL_MEDIUM_3_5_MODEL_ID,
        reasoningEffort: "none",
      },
      {
        providerId: "mistral",
        modelId: MISTRAL_SMALL_MODEL_ID,
        reasoningEffort: "none",
      },
      {
        providerId: "xai",
        modelId: GROK_4_6_MODEL_ID,
        reasoningEffort: "medium",
      },
      {
        providerId: "xai",
        modelId: GROK_3_MINI_MODEL_ID,
        reasoningEffort: "none",
      },
      {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "light",
      },
    ],
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
        modelId: GEMINI_3_7_FLASH_MODEL_ID,
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
        modelId: CLAUDE_OPUS_5_MODEL_ID,
        reasoningEffort: "high",
      },
      // Opus 5 is global-only until Vertex EU quota is provisioned, so keep 4.8
      // right behind it: without this, regional-only workspaces would fall all
      // the way through to OpenAI.
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
      // Basic-tier floor
      {
        providerId: "anthropic",
        modelId: CLAUDE_SONNET_4_6_MODEL_ID,
        reasoningEffort: "light",
      },
    ],
  };

// All fields other than the ids are placeholders to satisfy
// ModelConfigurationType: a meta-model is dynamically routed to a real model
// before it is ever used to run a completion.
function makeMetaModelConfig(
  id: ModelStreamIdType,
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
    displayName: "Standard",
    description: "Best for most",
  }
);

export const AUTO_FAST_MODEL_CONFIG: ModelConfigurationType =
  makeMetaModelConfig(AUTO_FAST_MODEL_ID, {
    displayName: "Basic",
    description: "Quick, low cost",
  });

export const AUTO_COMPLEX_MODEL_CONFIG: ModelConfigurationType =
  makeMetaModelConfig(AUTO_COMPLEX_MODEL_ID, {
    displayName: "Premium",
    description: "Slower, most capable",
  });
