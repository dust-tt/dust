import { AnthropicLLM } from "@app/lib/api/llm/clients/anthropic";
import { isAnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import { isOpenAIResponsesWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import type { LLM } from "@app/lib/api/llm/llm";
import type { Authenticator } from "@app/lib/auth";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import type { ProviderId } from "@app/lib/model_constructors/types/provider_ids";
import type { Region } from "@app/lib/model_constructors/types/regions";
import { isModelId } from "@app/types/assistant/models/models";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";

// Test credentials. The SDKs are mocked, so values only need to be present
// (the legacy Anthropic client asserts a non-empty ANTHROPIC_API_KEY).
export const PARITY_CREDENTIALS: LLMCredentialsType = {
  ANTHROPIC_API_KEY: "test-anthropic-key",
  OPENAI_API_KEY: "test-openai-key",
};

/** Per-call parameters shared by both routers for one parity case. */
export interface LegacyBuildParams {
  modelId: string;
  temperature?: number | null;
  reasoningEffort?: ReasoningEffort | null;
  responseFormat?: string | null;
}

/** The static surface we read off a registered stream endpoint constructor. */
export interface EndpointInfo {
  ctor: StreamEndpointConstructor;
  id: string;
  providerId: ProviderId;
  region: Region;
  modelId: string;
}

export function readEndpointInfo(
  ctor: StreamEndpointConstructor
): EndpointInfo {
  return {
    ctor,
    id: ctor.id,
    providerId: ctor.providerId,
    region: ctor.region,
    modelId: ctor.modelId,
  };
}

/**
 * Captured SDK `.stream()` arguments, populated by the mocked provider SDKs in
 * the test file. `ga` = the GA Messages API (`client.messages.stream`, used by
 * the new router); `beta` = the Beta Messages API (`client.beta.messages.stream`,
 * used by the legacy router). Keyed per provider so new providers add a bucket.
 */
export interface SdkCaptures {
  anthropic: { ga: unknown[]; beta: unknown[] };
  // OpenAI's legacy and new routers both call `client.responses.create`, so a
  // single bucket holds both requests, split by call order (see the adapter).
  openai: unknown[];
}

function first(arr: unknown[]): unknown {
  return arr.length > 0 ? arr[0] : undefined;
}

function last(arr: unknown[]): unknown {
  return arr.length > 0 ? arr[arr.length - 1] : undefined;
}

/**
 * A provider adapter encapsulates everything provider-specific about a parity
 * comparison: how to build the legacy LLM for a given endpoint, and which
 * captured SDK call holds the legacy vs. new request. Adding a provider = adding
 * one adapter here (plus its SDK mock in the test and a normalizer in
 * `allowlist.ts`).
 */
export interface ParityProvider {
  // Narrows the endpoint's raw model id to a legacy ModelIdType (throws if the
  // provider does not recognize it), so both routers are driven by the same id.
  toModelId(raw: string): ModelIdType;
  buildLegacyLLM(
    auth: Authenticator,
    endpoint: EndpointInfo,
    params: LegacyBuildParams
  ): LLM;
  selectOldRequest(endpoint: EndpointInfo, captures: SdkCaptures): unknown;
  selectNewRequest(endpoint: EndpointInfo, captures: SdkCaptures): unknown;
}

const anthropicProvider: ParityProvider = {
  toModelId(raw) {
    if (!isModelId(raw) || !isAnthropicWhitelistedModelId(raw)) {
      throw new Error(`${raw} is not a whitelisted Anthropic model.`);
    }
    return raw;
  },
  buildLegacyLLM(auth, _endpoint, params) {
    if (
      !isModelId(params.modelId) ||
      !isAnthropicWhitelistedModelId(params.modelId)
    ) {
      throw new Error(
        `${params.modelId} is not a whitelisted Anthropic model.`
      );
    }
    // Only global endpoints are exercised locally, so the legacy counterpart is
    // always the direct Anthropic API (no Vertex).
    return new AnthropicLLM(auth, {
      credentials: PARITY_CREDENTIALS,
      modelId: params.modelId,
      temperature: params.temperature,
      reasoningEffort: params.reasoningEffort,
      responseFormat: params.responseFormat,
      bypassFeatureFlag: true,
    });
  },
  selectOldRequest(_endpoint, captures) {
    return last(captures.anthropic.beta);
  },
  selectNewRequest(_endpoint, captures) {
    return last(captures.anthropic.ga);
  },
};

const openaiProvider: ParityProvider = {
  toModelId(raw) {
    if (!isModelId(raw) || !isOpenAIResponsesWhitelistedModelId(raw)) {
      throw new Error(`${raw} is not a whitelisted OpenAI model.`);
    }
    return raw;
  },
  buildLegacyLLM(auth, _endpoint, params) {
    if (
      !isModelId(params.modelId) ||
      !isOpenAIResponsesWhitelistedModelId(params.modelId)
    ) {
      throw new Error(`${params.modelId} is not a whitelisted OpenAI model.`);
    }
    // Only global endpoints are exercised locally; the legacy counterpart is
    // always the direct OpenAI Responses API.
    return new OpenAIResponsesLLM(auth, {
      credentials: PARITY_CREDENTIALS,
      modelId: params.modelId,
      temperature: params.temperature,
      reasoningEffort: params.reasoningEffort,
      responseFormat: params.responseFormat,
      bypassFeatureFlag: true,
    });
  },
  // Both routers hit the same `responses.create`; the test drains the legacy
  // stream before the new one, so the first capture is legacy, the last is new.
  selectOldRequest(_endpoint, captures) {
    return first(captures.openai);
  },
  selectNewRequest(_endpoint, captures) {
    return last(captures.openai);
  },
};

const PARITY_PROVIDERS: Partial<Record<ProviderId, ParityProvider>> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export function getParityProvider(providerId: ProviderId): ParityProvider {
  const provider = PARITY_PROVIDERS[providerId];
  if (!provider) {
    throw new Error(
      `No parity provider adapter registered for provider "${providerId}". ` +
        `Add one in tests/parity/providers.ts (plus an SDK mock and a normalizer).`
    );
  }
  return provider;
}

// Whether a provider has a parity adapter yet. Endpoints whose provider has no
// adapter are skipped by the parity suite (rather than throwing) until their
// adapter + SDK mock + normalizer are added.
export function hasParityProvider(providerId: ProviderId): boolean {
  return PARITY_PROVIDERS[providerId] !== undefined;
}
