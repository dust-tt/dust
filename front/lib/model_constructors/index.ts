// biome-ignore-all lint/plugin/noAppImportsInModels: base class needs to reference shared types
import { AnthropicClaudeSonnetFourDotSix } from "@app/lib/model_constructors/clients/anthropic/models/anthropic-claude-sonnet-4-6";
import { GeminiThreeDotOnePro } from "@app/lib/model_constructors/clients/google-ai-studio/models/gemini-3.1-pro";
import { OpenAiGptFiveDotTwo } from "@app/lib/model_constructors/clients/openai-responses/models/openai-gpt-5-2";
import { OpenAiGptFiveDotFour } from "@app/lib/model_constructors/clients/openai-responses/models/openai-gpt-5-4";
import type { DustModel } from "@app/lib/model_constructors/dust-model";
import type { LargeLanguageModel } from "@app/lib/model_constructors/large-language-model";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import {
  CLAUDE_SONNET_4_6_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
  GPT_5_2_MODEL_ID,
  GPT_5_4_MODEL_ID,
  type LargeLanguageModelId,
  MODELS,
  type Model,
} from "@app/lib/model_constructors/types/providers";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { Scope } from "@app/lib/model_constructors/types/scopes";
import { getIdFromModel } from "@app/lib/model_constructors/utils/getIdFromModel";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export { LargeLanguageModel } from "@app/lib/model_constructors/large-language-model";

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
  const ModelConstructor = MODEL_REGISTRY[getIdFromModel(model)];

  return new ModelConstructor(credentials);
}

const REGIONS_MAP: Record<RegionType, Region> = {
  "us-central1": "global",
  "europe-west1": "europe",
};

export function getModels(
  credentials: Credentials,
  {
    featureFlags,
    region,
    scope,
  }: {
    featureFlags: WhitelistableFeature[];
    region: RegionType;
    scope: Scope;
  },
  filters?: {
    providerId?: Model["providerId"];
    modelId?: Model["modelId"];
  }
): LargeLanguageModel[] {
  return MODELS.filter(
    (model) => !filters?.providerId || model.providerId === filters.providerId
  )
    .map((model) => getModel(credentials, model))
    .filter(
      (dustModel) =>
        // Feature flag check
        (dustModel.featureflag === null ||
          featureFlags.includes(dustModel.featureflag)) &&
        // Region availability check
        dustModel.regions[REGIONS_MAP[region]] &&
        // Right to display check
        dustModel.scopes[scope]
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
