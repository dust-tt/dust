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
  MODEL_ENDPOINTS,
  type ModelEndpoint,
  type ModelEndpointId,
  type ProviderApi,
  type ProviderId,
} from "@app/lib/model_constructors/types/model-endpoints";
import type { Region } from "@app/lib/model_constructors/types/regions";
import type { Scope } from "@app/lib/model_constructors/types/scopes";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export { LargeLanguageModel } from "@app/lib/model_constructors/large-language-model";

type ModelClassConstructor = {
  new (credentials: Credentials): DustModel;
};

const MODEL_REGISTRY = {
  "anthropic/anthropic/global/claude-sonnet-4-6":
    AnthropicClaudeSonnetFourDotSix,
  "openai/openai/global/gpt-5.2": OpenAiGptFiveDotTwo,
  "openai/openai/global/gpt-5.4": OpenAiGptFiveDotFour,
  "google-ai-studio/google-ai-studio/global/gemini-3.1-pro-preview":
    GeminiThreeDotOnePro,
} as const satisfies Record<ModelEndpointId, ModelClassConstructor>;

export function getModelInstance(
  credentials: Credentials,
  modelEndpointId: ModelEndpointId
): LargeLanguageModel {
  const ModelConstructor = MODEL_REGISTRY[modelEndpointId];

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
    scope,
  }: {
    featureFlags: WhitelistableFeature[];
    scope: Scope;
  },
  filters?: {
    region: RegionType;
    providerId?: ProviderId;
    modelId?: ModelEndpoint["modelId"];
    api?: ProviderApi;
  }
): LargeLanguageModel[] {
  return MODEL_ENDPOINTS.filter(
    (modelEndpoint) =>
      (!filters?.providerId ||
        modelEndpoint.providerId === filters.providerId) &&
      (!filters?.modelId || modelEndpoint.modelId === filters.modelId) &&
      (!filters?.api || modelEndpoint.api === filters.api) &&
      (!filters?.region || modelEndpoint.region === REGIONS_MAP[filters.region])
  )
    .map((modelEndpoint) =>
      getModelInstance(credentials, getIdFromModelEndpoint(modelEndpoint))
    )
    .filter(
      (dustModel) =>
        // Feature flag check
        (dustModel.featureflag === null ||
          featureFlags.includes(dustModel.featureflag)) &&
        // Right to display check
        dustModel.scopes[scope]
    );
}

function _getModelFromId(id: ModelEndpointId): ModelEndpoint {
  return MODEL_REGISTRY[id].prototype.model;
}

export function getIdFromModelEndpoint(
  modelEndpoint: ModelEndpoint
): ModelEndpointId {
  return `${modelEndpoint.providerId}/${modelEndpoint.api}/${modelEndpoint.region}/${modelEndpoint.modelId}` as ModelEndpointId;
}

const _BEST_PERFORMING_MODEL_IDS: ModelEndpoint["modelId"][] = [
  GPT_5_4_MODEL_ID,
  GPT_5_2_MODEL_ID,
  CLAUDE_SONNET_4_6_MODEL_ID,
  GEMINI_3_1_PRO_MODEL_ID,
];

const _ORDERED_LARGE_LANGUAGE_MODEL_IDS: ModelEndpoint["modelId"][] = [];
