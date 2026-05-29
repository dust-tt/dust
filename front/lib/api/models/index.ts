// biome-ignore-all lint/plugin/noAppImportsInModels: base class needs to reference shared types
import { AnthropicClaudeSonnetFourDotSix } from "@app/lib/api/models/clients/anthropic/models/anthropic-claude-sonnet-4-6";
import { GeminiThreeDotOnePro } from "@app/lib/api/models/clients/google-ai-studio/models/gemini-3.1-pro";
import { OpenAiGptFiveDotTwo } from "@app/lib/api/models/clients/openai-responses/models/openai-gpt-5-2";
import { OpenAiGptFiveDotFour } from "@app/lib/api/models/clients/openai-responses/models/openai-gpt-5-4";
import type { DustModel } from "@app/lib/api/models/dust-model";
import type { LargeLanguageModel } from "@app/lib/api/models/large-language-model";
import type { Credentials } from "@app/lib/api/models/types/credentials";
import {
  CLAUDE_SONNET_4_6_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GPT_5_2_MODEL_ID,
  GPT_5_4_MODEL_ID,
  type LargeLanguageModelId,
  MODELS,
  type Model,
  type ProviderId,
} from "@app/lib/api/models/types/providers";
import type { Region } from "@app/lib/api/models/types/regions";
import { getIdFromModel } from "@app/lib/api/models/utils/getIdFromModel";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export { LargeLanguageModel } from "@app/lib/api/models/large-language-model";

type ModelClassConstructor = {
  new (credentials: Credentials): DustModel;
};

const MODEL_REGISTRY = {
  "anthropic/claude-sonnet-4-6": AnthropicClaudeSonnetFourDotSix,
  "openai/gpt-5.2": OpenAiGptFiveDotTwo,
  "openai/gpt-5.4": OpenAiGptFiveDotFour,
  "google-ai-studio/gemini-3.1-pro-preview": GeminiThreeDotOnePro,
} as const satisfies Record<LargeLanguageModelId, ModelClassConstructor>;

export function getModel(
  credentials: Credentials,
  model: Model
): LargeLanguageModel {
  const ModelClass = MODEL_REGISTRY[getIdFromModel(model)];

  return new ModelClass(credentials);
}

const REGIONS_MAP: Record<RegionType, Region> = {
  "us-central1": "global",
  "europe-west1": "europe",
};

export function getModels(
  credentials: Credentials,
  {
    providerId,
    featureFlags,
    region,
  }: {
    providerId?: ProviderId;
    featureFlags: WhitelistableFeature[];
    region: RegionType;
  }
): LargeLanguageModel[] {
  return MODELS.filter(
    (model) => !providerId || model.providerId === providerId
  )
    .map((model) => getModel(credentials, model))
    .filter(
      (dustModel) =>
        // Feature flag check
        (dustModel.featureflag === null ||
          featureFlags.includes(dustModel.featureflag)) &&
        // Region availability check
        dustModel.regions[REGIONS_MAP[region]]
    );
}

function _getModelFromId(id: LargeLanguageModelId): Model {
  return MODEL_REGISTRY[id].prototype.model;
}

const _BEST_PERFORMING_MODEL_IDS: Model["modelId"][] = [
  GPT_5_4_MODEL_ID,
  GPT_5_2_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
];

const _ORDERED_LARGE_LANGUAGE_MODEL_IDS: Model["modelId"][] = [];
