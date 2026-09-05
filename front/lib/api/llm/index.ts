import { getWhitelistedProviders } from "@app/lib/api/assistant/models";
import config from "@app/lib/api/config";
import type { LLM } from "@app/lib/api/llm/llm";
import {
  BatchEndpointTransition,
  NoopStreamTransition,
  StreamEndpointTransition,
} from "@app/lib/api/llm/transitionLLM";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { config as multiRegionsConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type {
  EndpointConfig,
  ValueFilter,
  Where,
} from "@app/lib/llms/types/filter";
import { FIREWORKS_MODEL_PREFIX } from "@app/lib/model_constructors/providers/fireworks/constants";
import type { Host } from "@app/lib/model_constructors/types/hosts";
import { GOOGLE_AI_STUDIO_HOST } from "@app/lib/model_constructors/types/hosts";
import type { Lab } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import { isModel, NOOP_MODEL } from "@app/lib/model_constructors/types/models";
import type { Region } from "@app/lib/model_constructors/types/regions";
import { EUROPE } from "@app/lib/model_constructors/types/regions";
import { BYOK_MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import compact from "lodash/compact";
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

function getRegionFilter(auth: Authenticator): ValueFilter<Region> | undefined {
  const dustRegion = multiRegionsConfig.getCurrentRegion();

  const regionalModelsOnly = auth.getNonNullableWorkspace().regionalModelsOnly;
  if (dustRegion === "us-central1" || !regionalModelsOnly) {
    return undefined;
  }

  return { eq: EUROPE };
}

function getWhitelistedProviderIds(
  auth: Authenticator,
  whiteListedProviders: ModelProviderIdType[] | null
): ModelProviderIdType[] {
  const whitelistedProviderIds = [
    ...getWhitelistedProviders(auth, whiteListedProviders),
  ];
  const byok = auth.getNonNullablePlan().isByok;

  return byok
    ? intersection(whitelistedProviderIds, BYOK_MODEL_PROVIDER_IDS)
    : whitelistedProviderIds;
}

const PROVIDER_ID_TO_LAB: Record<ModelProviderIdType, Lab | null> = {
  openai: "openai",
  anthropic: "anthropic",
  mistral: "mistral",
  google_ai_studio: "google",
  deepseek: "deepseek",
  fireworks: null,
  xai: "xai",
  noop: "noop",
  auto: null,
  auto_fast: null,
  auto_complex: null,
};

const PROVIDER_ID_TO_HOST: Record<ModelProviderIdType, Host | null> = {
  openai: null,
  anthropic: null,
  mistral: null,
  google_ai_studio: null,
  deepseek: null,
  fireworks: "fireworks",
  xai: null,
  noop: null,
  auto: null,
  auto_fast: null,
  auto_complex: null,
};

// Whitelisting is keyed on the legacy provider id, which conflates a model's
// lab (its developer) and its serving host — e.g. "fireworks" is really a host,
// not a lab. When "fireworks" is whitelisted we match on host so its
// lab-attributed models (deepseek/moonshot_ai/z_ai) surface; every other
// provider id maps to a lab. This is a known domain naming error to be fixed
// later.
function getLabAndHostFilter(
  providerIds: ModelProviderIdType[]
): Where<EndpointConfig> {
  const whitelistedLabs = compact(
    providerIds.map((id) => PROVIDER_ID_TO_LAB[id])
  );
  const labFilter: Where<EndpointConfig> = {
    lab: { in: whitelistedLabs },
  };
  const whitelistedHosts = compact(
    providerIds.map((id) => PROVIDER_ID_TO_HOST[id])
  );
  const hostFilter: Where<EndpointConfig> = {
    host: { in: whitelistedHosts },
  };

  return { or: [labFilter, hostFilter] };
}

// Temporary helper while we have both systems
export function getWorkspaceFilter(
  auth: Authenticator,
  whiteListedProviders: ModelProviderIdType[] | null
): Where<EndpointConfig> {
  const byok = auth.getNonNullablePlan().isByok;
  const providerIds = getWhitelistedProviderIds(auth, whiteListedProviders);

  return {
    ...getLabAndHostFilter(providerIds),
    region: getRegionFilter(auth),
    // We route all non-byok gemini requests to agent platform.
    ...(byok ? {} : { not: { host: { eq: GOOGLE_AI_STUDIO_HOST } } }),
  };
}

// Maps a legacy `ModelIdType` (Fireworks ids still carry the
// `accounts/fireworks/models/` prefix) to the bare `Model` id the router keys
// endpoints by. Returns null for unknown ids.
export function legacyModelIdToModel(modelId: string): Model | null {
  const bare = modelId.startsWith(FIREWORKS_MODEL_PREFIX)
    ? modelId.slice(FIREWORKS_MODEL_PREFIX.length)
    : modelId;

  return isModel(bare) ? bare : null;
}

export function getStreamLLM(
  auth: Authenticator,
  llmParameters: LLMParameters<DustStreamEndpointConstructor>
): LLM<DustStreamEndpointConstructor> | null {
  const endpoint = llmParameters.modelInfo.endpoint;

  // The noop model needs a dedicated transition to preserve its static-response
  // and simulated-credit behaviors, which the generic transition drops.
  if (endpoint.model === NOOP_MODEL) {
    return new NoopStreamTransition(auth, llmParameters, endpoint);
  }

  const modelConfig = llmParameters.modelInfo.endpoint.modelConfig;
  const credentials = modelConfig?.useEapKey
    ? withEapAnthropicKey(modelConfig.modelId, llmParameters.credentials)
    : llmParameters.credentials;

  return new StreamEndpointTransition(
    auth,
    { ...llmParameters, credentials },
    endpoint
  );
}

export async function getBatchLLM(
  auth: Authenticator,
  llmParameters: LLMParameters<DustBatchEndpointConstructor>
): Promise<LLM | null> {
  const endpoint = llmParameters.modelInfo.endpoint;

  return new BatchEndpointTransition(auth, llmParameters, endpoint);
}
