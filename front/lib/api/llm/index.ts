import { AnthropicLLM } from "@app/lib/api/llm/clients/anthropic";
import {
  isAnthropicVertexWhitelistedModelId,
  isAnthropicWhitelistedModelId,
} from "@app/lib/api/llm/clients/anthropic/types";
import { FireworksLLM } from "@app/lib/api/llm/clients/fireworks";
import { isFireworksWhitelistedModelId } from "@app/lib/api/llm/clients/fireworks/types";
import { GoogleLLM } from "@app/lib/api/llm/clients/google";
import {
  isGoogleAIStudioWhitelistedModelId,
  isGoogleVertexWhitelistedModelId,
} from "@app/lib/api/llm/clients/google/types";
import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import { isMistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import { NoopLLM } from "@app/lib/api/llm/clients/noop";
import { isNoopWhitelistedModelId } from "@app/lib/api/llm/clients/noop/types";
import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import { isOpenAIResponsesWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { XaiLLM } from "@app/lib/api/llm/clients/xai";
import { isXaiWhitelistedModelId } from "@app/lib/api/llm/clients/xai/types";
import type { LLM } from "@app/lib/api/llm/llm";
import { TransitionLLM } from "@app/lib/api/llm/transitionLLM";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { getModels } from "@app/lib/api/models";
import type { Model } from "@app/lib/api/models/types/providers";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { CLAUDE_SONNET_4_6_MODEL_ID } from "@app/types/assistant/models/anthropic";
import type { ModelIdType } from "@app/types/assistant/models/types";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const MODEL_ID_TO_NEW_MODEL_TYPE: Partial<Record<ModelIdType, Model>> = {
  [CLAUDE_SONNET_4_6_MODEL_ID]: {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-6",
  },
};

function getNewLLM(
  auth: Authenticator,
  llmParameters: LLMParameters,
  featureFlags: WhitelistableFeature[]
): LLM | null {
  if (!featureFlags.includes("use_new_llm_router")) {
    return null;
  }

  const newModel = MODEL_ID_TO_NEW_MODEL_TYPE[llmParameters.modelId];
  if (!newModel) {
    return null;
  }

  const models = getModels(
    llmParameters.credentials,
    {
      featureFlags,
      region: multiRegionsConfig.getCurrentRegion(),
      scope: "run",
    },
    newModel
  );

  const model = models[0];
  if (!model) {
    return null;
  }

  return new TransitionLLM(auth, llmParameters, model);
}

export async function getLLM(
  auth: Authenticator,
  {
    credentials,
    getTraceInput,
    getTraceOutput,
    modelId,
    temperature,
    reasoningEffort,
    responseFormat,
    metaData,
    bypassFeatureFlag = false,
    context,
    omittedThinking,
  }: LLMParameters
): Promise<LLM | null> {
  const modelConfig = getModelConfigByModelId(modelId);
  if (!modelConfig) {
    return null;
  }

  const featureFlags = await getFeatureFlags(auth);

  const newLLM = getNewLLM(
    auth,
    {
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      responseFormat,
      metaData,
      bypassFeatureFlag,
      context,
      omittedThinking,
    },
    featureFlags
  );

  if (newLLM) {
    return newLLM;
  }

  if (isMistralWhitelistedModelId(modelId)) {
    return new MistralLLM(auth, {
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      responseFormat,
      bypassFeatureFlag,
      context,
    });
  }

  if (isOpenAIResponsesWhitelistedModelId(modelId)) {
    return new OpenAIResponsesLLM(auth, {
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      responseFormat,
      bypassFeatureFlag,
      context,
    });
  }

  if (isFireworksWhitelistedModelId(modelId)) {
    return new FireworksLLM(auth, {
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      responseFormat,
    });
  }
  if (isNoopWhitelistedModelId(modelId)) {
    return new NoopLLM(auth, {
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      metaData,
    });
  }

  if (isXaiWhitelistedModelId(modelId)) {
    return new XaiLLM(auth, {
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      responseFormat,
      bypassFeatureFlag,
    });
  }

  const useVertexPrerequisite =
    featureFlags.includes("use_vertex_for_supported_models") &&
    !auth.getNonNullablePlan().isByok;

  if (isGoogleAIStudioWhitelistedModelId(modelId)) {
    const useVertex =
      useVertexPrerequisite && isGoogleVertexWhitelistedModelId(modelId);

    return new GoogleLLM(auth, {
      useVertex,
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      responseFormat,
      bypassFeatureFlag,
      context,
    });
  }

  if (isAnthropicWhitelistedModelId(modelId)) {
    const useVertex =
      useVertexPrerequisite && isAnthropicVertexWhitelistedModelId(modelId);

    return new AnthropicLLM(auth, {
      useVertex,
      credentials,
      getTraceInput,
      getTraceOutput,
      modelId,
      temperature,
      reasoningEffort,
      responseFormat,
      bypassFeatureFlag,
      context,
      omittedThinking,
    });
  }

  return null;
}
