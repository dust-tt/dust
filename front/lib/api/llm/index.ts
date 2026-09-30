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
import {
  AGENT_PLATFORM_HOST,
  GOOGLE_AI_STUDIO_HOST,
} from "@app/lib/model_constructors/types/hosts";
import type { Lab } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import { isModel, NOOP_MODEL } from "@app/lib/model_constructors/types/models";
import type { Region } from "@app/lib/model_constructors/types/regions";
import { EUROPE } from "@app/lib/model_constructors/types/regions";
import { CUSTOM_MODEL_IDS } from "@app/types/assistant/models/custom_models.generated";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { BYOK_MODEL_PROVIDER_IDS } from "@app/types/assistant/models/providers";
import type {
  ModelIdType,
  WhitelistableModelMakerIdType,
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
  // Reaching this with BYOK credentials means an EAP endpoint escaped
  // `getWorkspaceFilter`; the EAP key is Dust's, so fail loudly instead of
  // billing Dust's Anthropic org for a BYOK workspace.
  if (credentials.DUST_BYOK === "true") {
    throw new Error(
      `Model ${modelId} requires the Dust-owned EAP Anthropic key and must not be reachable by a BYOK workspace.`
    );
  }

  const eapApiKey = config.getAnthropicEapApiKey();
  if (!eapApiKey) {
    throw new Error(
      `ANTHROPIC_EAP_API_KEY is not configured but model ${modelId} requires the EAP Anthropic key.`
    );
  }
  return { ...credentials, ANTHROPIC_API_KEY: eapApiKey };
}

const EAP_MODELS = compact(
  SUPPORTED_MODEL_CONFIGS.filter(({ useEapKey }) => useEapKey).map(
    ({ modelId }) => legacyModelIdToModel(modelId)
  )
);

// Custom models are test models that run on Dust's keys, whichever one they use.
const BYOK_EXCLUDED_MODELS: Model[] = [...EAP_MODELS, ...CUSTOM_MODEL_IDS];

function getRegionFilter(auth: Authenticator): ValueFilter<Region> | undefined {
  const dustRegion = multiRegionsConfig.getCurrentRegion();

  const regionalModelsOnly = auth.getNonNullableWorkspace().regionalModelsOnly;
  if (dustRegion === "us-central1" || !regionalModelsOnly) {
    return undefined;
  }

  return { eq: EUROPE };
}

function getWhitelistedMakerIds(
  auth: Authenticator
): WhitelistableModelMakerIdType[] {
  const whitelistedMakerIds = [...getWhitelistedProviders(auth)];
  const byok = auth.getNonNullablePlan().isByok;

  return byok
    ? intersection(whitelistedMakerIds, BYOK_MODEL_PROVIDER_IDS)
    : whitelistedMakerIds;
}

const MAKER_ID_TO_LAB: Record<WhitelistableModelMakerIdType, Lab | null> = {
  openai: "openai",
  anthropic: "anthropic",
  mistral: "mistral",
  google_ai_studio: "google",
  deepseek: "deepseek",
  xai: "xai",
  noop: "noop",
  auto: null,
  auto_fast: null,
  auto_complex: null,
  zai: "z_ai",
  moonshot: "moonshot_ai",
  // No MiniMax endpoint exists.
  minimax: null,
  thinking_machines: "thinking_machines",
};

const MAKER_ID_TO_HOST: Record<WhitelistableModelMakerIdType, Host | null> = {
  openai: null,
  anthropic: null,
  mistral: "mistral",
  google_ai_studio: null,
  deepseek: null,
  xai: null,
  noop: null,
  auto: null,
  auto_fast: null,
  auto_complex: null,
  zai: null,
  moonshot: null,
  minimax: null,
  thinking_machines: null,
};

// Whitelisting "mistral" also matches on host, so every endpoint Mistral serves
// surfaces; every other maker id maps to a lab only.
function getLabAndHostFilter(
  makerIds: WhitelistableModelMakerIdType[]
): Where<EndpointConfig> {
  const labFilter: Where<EndpointConfig> = {
    lab: { in: compact(makerIds.map((id) => MAKER_ID_TO_LAB[id])) },
  };
  const hostFilter: Where<EndpointConfig> = {
    host: { in: compact(makerIds.map((id) => MAKER_ID_TO_HOST[id])) },
  };

  return { or: [labFilter, hostFilter] };
}

// Temporary helper while we have both systems
/**
 * @cc [owner:pmilliotte,label:security;product] byok-never-routes-to-dust-hosted-inference
 * A workspace on a BYOK plan (`plan.isByok`) must only reach endpoints served by the model lab's
 * own API, using the credentials the workspace provided. Endpoints hosted on Dust's infrastructure
 * — `agent-platform` (Vertex, keyed by `AGENT_PLATFORM_PROJECT_ID`) today — must be filtered out
 * here, not merely made unreachable by an endpoint's `endpointFilter`: plan and feature-flag
 * conditions can change, the BYOK guarantee cannot.
 *
 * Any new Dust-hosted `Host` value must be added to that exclusion, and every model reachable by a
 * BYOK workspace must keep at least one lab-hosted endpoint.
 */
/**
 * @cc [owner:pmilliotte,label:security;product] eap-models-are-never-byok-reachable
 * A model whose config carries `useEapKey` is served from Dust's own Anthropic EAP organization, on
 * Dust's key. This filter must leave a BYOK workspace no endpoint for such a model, and must derive
 * the exclusion from `useEapKey` itself so a newly flagged model is covered without a second edit.
 * `isModelAvailable` must reject it too, so it never reaches the model picker.
 *
 * The `DUST_BYOK` check in `withEapAnthropicKey` is a backstop, not the guarantee: it turns a leak
 * into an error instead of a request billed to Dust's Anthropic organization.
 */
/**
 * @cc [owner:pmilliotte,label:security;product] custom-models-are-never-byok-reachable
 * A custom model (generated from the infra custom-models config) must leave a BYOK workspace no
 * endpoint, whether or not it carries `useEapKey`: it is a test model served on Dust's keys.
 * `isModelAvailable` must reject it too.
 */
export function getWorkspaceFilter(auth: Authenticator): Where<EndpointConfig> {
  const byok = auth.getNonNullablePlan().isByok;
  const makerIds = getWhitelistedMakerIds(auth);

  return {
    ...getLabAndHostFilter(makerIds),
    region: getRegionFilter(auth),
    // Conversely we route all non-byok gemini requests to agent platform.
    ...(byok
      ? {
          not: {
            or: [
              { host: { eq: AGENT_PLATFORM_HOST } },
              { model: { in: BYOK_EXCLUDED_MODELS } },
            ],
          },
        }
      : { not: { host: { eq: GOOGLE_AI_STUDIO_HOST } } }),
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
