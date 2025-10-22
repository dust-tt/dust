import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

export async function getLLM(
  auth: Authenticator,
  {
    modelId,
    options: _options,
  }: {
    modelId: ModelIdType;
    options?: LLMOptions;
  }
): Promise<LLM | null> {
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const hasFeature = featureFlags.includes("llm_router_direct_requests");

  const modelConfiguration = SUPPORTED_MODEL_CONFIGS.find(
    (config) => config.modelId === modelId
  );

  if (!modelConfiguration) {
    return null;
  }

  switch (modelId) {
    case "mistral-large-latest":
      return hasFeature ? new MistralLLM({ model: modelConfiguration }) : null;
    default:
      return null;
  }
}
