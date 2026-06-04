import config from "@app/lib/api/config";
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
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import type { ModelIdType } from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";

// EAP (Early Access Program) models are served through a dedicated Anthropic
// workspace key (ANTHROPIC_EAP_API_KEY) rather than the workspace's
// Dust-managed / BYOK credentials.
//
// Invariant: the env key must be set before any model opts into `useEapKey`
// (see deploy plan). We throw rather than degrade to "unsupported" so the
// misconfiguration is loud instead of silently falling back to the standard key.
function withEapAnthropicKey(
  modelId: ModelIdType,
  credentials: LLMCredentialsType
): LLMCredentialsType {
  const eapApiKey = config.getAnthropicEapApiKey();
  if (!eapApiKey) {
    throw new Error(
      `ANTHROPIC_EAP_API_KEY is not configured but model ${modelId} requires the EAP Anthropic key.`
    );
  }
  return { ...credentials, ANTHROPIC_API_KEY: eapApiKey };
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

  const featureFlags = await getFeatureFlags(auth);

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

    const anthropicCredentials = modelConfig.useEapKey
      ? withEapAnthropicKey(modelId, credentials)
      : credentials;

    return new AnthropicLLM(auth, {
      useVertex,
      credentials: anthropicCredentials,
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
