import { getStreamLLM } from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import { getStreamEndpointFromLegacyModelId } from "@app/lib/api/llm/selectPreferredEndpointForWorkspace";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

// Resolves the preferred stream endpoint for a legacy model id and builds an LLM
// for the eval suites (credentials + feature-flag bypass handled here).
export async function getEvalStreamLLM(
  auth: Authenticator,
  {
    modelId,
    temperature,
    reasoningEffort,
  }: {
    modelId: ModelIdType;
    temperature?: number;
    reasoningEffort?: ReasoningEffort;
  }
): Promise<LLM<DustStreamEndpointConstructor>> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  const endpoint = await getStreamEndpointFromLegacyModelId(auth, modelId);
  if (!endpoint) {
    throw new Error(`Failed to resolve stream endpoint for model ${modelId}`);
  }

  const llm = getStreamLLM(auth, {
    credentials,
    modelInfo: { endpoint, temperature, reasoningEffort },
    bypassFeatureFlag: true,
  });
  if (!llm) {
    throw new Error(`Failed to initialize LLM for model ${modelId}`);
  }

  return llm;
}

// Shared judge LLM used by the eval suites: gpt-5-mini at a low temperature.
export function getJudgeLLM(
  auth: Authenticator
): Promise<LLM<DustStreamEndpointConstructor>> {
  return getEvalStreamLLM(auth, { modelId: "gpt-5-mini", temperature: 0.2 });
}
