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
import { isGoogleVertexWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import { isMistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import { NoopLLM } from "@app/lib/api/llm/clients/noop";
import { isNoopWhitelistedModelId } from "@app/lib/api/llm/clients/noop/types";
import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import { isOpenAIResponsesWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { XaiLLM } from "@app/lib/api/llm/clients/xai";
import { isXaiWhitelistedModelId } from "@app/lib/api/llm/clients/xai/types";
import type { LLM } from "@app/lib/api/llm/llm";
import { StreamEndpointTransition } from "@app/lib/api/llm/transitionLLM";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import {
  config as multiRegionsConfig,
  config as regionConfig,
} from "@app/lib/api/regions/config";
import { isEnterpriseOrDust } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { getStreamEndpoints } from "@app/lib/llms/stream";
import type {
  ValueFilter,
  Where,
  WorkspaceFilter,
} from "@app/lib/llms/stream/types/filter";
import { sortEndpointsByPreferredRegion } from "@app/lib/llms/utils/sort_endpoints";
import { isModelId } from "@app/lib/model_constructors/types/model_ids";
import {
  isProviderId,
  type ProviderId,
} from "@app/lib/model_constructors/types/provider_ids";
import {
  EUROPE,
  GLOBAL,
  type Region,
} from "@app/lib/model_constructors/types/regions";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { BYOK_MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type { ModelIdType } from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import type { RegionType } from "@app/types/region";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import intersection from "lodash/intersection";

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

  const plan = auth.getNonNullablePlan();

  if (isGoogleVertexWhitelistedModelId(modelId)) {
    return new GoogleLLM(auth, {
      useVertex: !plan.isByok,
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

  const featureFlags = await getFeatureFlags(auth);

  const useVertexPrerequisite =
    !plan.isByok &&
    regionConfig.getCurrentRegion() === "europe-west1" &&
    (isCreditPricedPlanPrefix(plan.code) ||
      featureFlags.includes("use_vertex_for_supported_models"));

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
  const featureFlags = await getFeatureFlags(auth);

  const streamEndpointLLM = getStreamEndpointLLM(
    auth,
    featureFlags,
    llmParameters
  );

  if (featureFlags.includes("use_new_llm_router") && streamEndpointLLM) {
    return streamEndpointLLM;
  }

  const legacyLLM = await getLegacyLLM(auth, llmParameters);

  return legacyLLM;
}

function getRegionFilter(auth: Authenticator): ValueFilter<Region> | undefined {
  const dustRegion = multiRegionsConfig.getCurrentRegion();

  const regionalModelsOnly = auth.getNonNullableWorkspace().regionalModelsOnly;
  if (dustRegion === "us-central1" || !regionalModelsOnly) {
    return undefined;
  }

  return { eq: EUROPE };
}

function getProviderIdFilter(auth: Authenticator): ValueFilter<ProviderId> {
  const whitelistedProviderIds = [...getWhitelistedProviders(auth)].filter(
    isProviderId
  );
  const byok = auth.getNonNullablePlan().isByok;
  const providerIds = byok
    ? intersection(whitelistedProviderIds, BYOK_MODEL_PROVIDER_IDS)
    : whitelistedProviderIds;

  return { in: providerIds };
}

// Temporary helper while we have both systems
export function getWorkspaceFilter(
  auth: Authenticator
): Where<WorkspaceFilter> {
  return {
    providerId: getProviderIdFilter(auth),
    region: getRegionFilter(auth),
  };
}

const REGION_MAPPING: Record<RegionType, Region> = {
  "europe-west1": EUROPE,
  "us-central1": GLOBAL,
};

function getStreamEndpointLLM(
  auth: Authenticator,
  featureFlags: WhitelistableFeature[],
  llmParameters: LLMParameters
): LLM | null {
  // llmParameters.modelId is ModelIdType — narrow before filtering.
  if (!isModelId(llmParameters.modelId)) {
    return null;
  }

  const workspaceFilter = getWorkspaceFilter(auth);

  const endpoints = getStreamEndpoints(
    {
      featureFlags,
      enterprise: isEnterpriseOrDust(auth.getNonNullablePlan()),
    },
    {
      ...workspaceFilter,
      modelId: {
        eq: llmParameters.modelId,
      },
    }
  );

  const preferredRegion = REGION_MAPPING[multiRegionsConfig.getCurrentRegion()];

  const sortedEndpoints = sortEndpointsByPreferredRegion(
    endpoints,
    preferredRegion
  );

  const endpoint = sortedEndpoints[0];

  if (!endpoint) {
    return null;
  }

  return new StreamEndpointTransition(auth, llmParameters, endpoint);
}
