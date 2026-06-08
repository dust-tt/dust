import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
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
import {
  BatchEndpointTransition,
  StreamEndpointTransition,
} from "@app/lib/api/llm/transitionLLM";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { getAvailableBatchEndpoints } from "@app/lib/model_constructors/batch";
import { getAvailableStreamEndpoints } from "@app/lib/model_constructors/stream";
import type { Filter } from "@app/lib/model_constructors/types/filter";
import { isModelId } from "@app/lib/model_constructors/types/model_ids";
import { isProviderId } from "@app/lib/model_constructors/types/provider_ids";
import { GLOBAL, type Region } from "@app/lib/model_constructors/types/regions";
import type { ModelIdType } from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import type { RegionType } from "@app/types/region";

// Temporary helper while we have both systems
export async function getWorkspaceFilters(
  auth: Authenticator
): Promise<Pick<Filter, "byok" | "providerIds" | "regions" | "featureFlags">> {
  const providerIds = [...getWhitelistedProviders(auth)].filter(isProviderId);

  const featureFlags = await getFeatureFlags(auth);

  const plan = auth.getNonNullablePlan();
  const byok = plan.isByok;

  const region = REGION_TYPE_TO_REGION[multiRegionsConfig.getCurrentRegion()];
  const regions = auth.getNonNullableWorkspace().regionalModelsOnly
    ? [region]
    : [region, GLOBAL];

  return {
    providerIds,
    regions,
    byok,
    featureFlags,
  };
}

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

const REGION_TYPE_TO_REGION: Record<RegionType, Region> = {
  "us-central1": "global",
  "europe-west1": "europe",
};

// New streaming router: resolves a `StreamEndpoint` from `STREAM_MODELS`.
async function getStreamEndpointLLM(
  auth: Authenticator,
  llmParameters: LLMParameters
): Promise<LLM | null> {
  // llmParameters.modelId is ModelIdType — narrow before filtering.
  if (!isModelId(llmParameters.modelId)) {
    return null;
  }

  const workspaceFilter = await getWorkspaceFilters(auth);

  const endpoint = getAvailableStreamEndpoints({
    ...workspaceFilter,
    modelIds: [llmParameters.modelId],
  })[0];

  if (!endpoint) {
    return null;
  }

  return new StreamEndpointTransition(auth, llmParameters, endpoint);
}

// New batch router: resolves a `BatchEndpoint` from the separate `BATCH_MODELS`
// registry. A model may expose streaming without batch, in which case this
// returns null and the caller falls back to the legacy clients.
export async function getBatchEndpointLLM(
  auth: Authenticator,
  llmParameters: LLMParameters
): Promise<LLM | null> {
  // llmParameters.modelId is ModelIdType — narrow before filtering.
  if (!isModelId(llmParameters.modelId)) {
    return null;
  }

  const workspaceFilter = await getWorkspaceFilters(auth);

  const endpoint = getAvailableBatchEndpoints({
    ...workspaceFilter,
    modelIds: [llmParameters.modelId],
  })[0];

  if (!endpoint) {
    return null;
  }

  return new BatchEndpointTransition(auth, llmParameters, endpoint);
}

// Legacy router: dispatches to the per-provider client classes, which implement
// both the streaming and batch surfaces on the returned instance.
export async function getLegacyLLM(
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
    const useEapKey = getModelConfigByModelId(modelId)?.useEapKey ?? false;

    // EAP models must hit the Anthropic API directly with the EAP key. Vertex
    // authenticates via GCP project creds and ignores ANTHROPIC_API_KEY, so
    // routing an EAP model through Vertex would silently drop the EAP key.
    const useVertex =
      !useEapKey &&
      useVertexPrerequisite &&
      isAnthropicVertexWhitelistedModelId(modelId);

    const anthropicCredentials = useEapKey
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

// Resolves an LLM for the streaming surface: the new `StreamEndpoint`-backed
// router when enabled, falling back to the legacy per-provider clients.
export async function getLLM(
  auth: Authenticator,
  llmParameters: LLMParameters
): Promise<LLM | null> {
  const modelConfig = getModelConfigByModelId(llmParameters.modelId);
  if (!modelConfig) {
    return null;
  }

  const streamEndpointLLM = await getStreamEndpointLLM(auth, llmParameters);

  if (streamEndpointLLM) {
    return streamEndpointLLM;
  }

  const legacyLLM = await getLegacyLLM(auth, llmParameters);

  return legacyLLM;
}

// Resolves an LLM for the batch surface: the new `BatchEndpoint`-backed router
// when a batch model exists for the requested identity, falling back to the
// legacy per-provider clients (which implement batch on the instance).
export async function getBatchLLM(
  auth: Authenticator,
  llmParameters: LLMParameters
): Promise<LLM | null> {
  const modelConfig = getModelConfigByModelId(llmParameters.modelId);
  if (!modelConfig) {
    return null;
  }

  const batchEndpointLLM = await getBatchEndpointLLM(auth, llmParameters);

  if (batchEndpointLLM) {
    return batchEndpointLLM;
  }

  const legacyLLM = await getLegacyLLM(auth, llmParameters);

  return legacyLLM;
}
