import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { AnthropicLLM } from "./clients/anthropic";

// Keep this until the list includes all the supported model IDs (cf SUPPORTED_MODEL_CONFIGS)
const WHITELISTED_MODEL_IDS: ModelIdType[] = [
  "mistral-large-latest",
  "mistral-small-latest",
  "claude-sonnet-4-5-20250929",
];

export async function getLLM(
  auth: Authenticator,
  {
    modelId,
    options,
  }: {
    modelId: ModelIdType;
    options?: LLMOptions;
  }
): Promise<LLM | null> {
  if (!WHITELISTED_MODEL_IDS.includes(modelId)) {
    return null;
  }

  const modelConfiguration = SUPPORTED_MODEL_CONFIGS.find(
    (config) => config.modelId === modelId
  );
  if (!modelConfiguration) {
    return null;
  }

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const hasFeature =
    options?.bypassFeatureFlag ??
    featureFlags.includes("llm_router_direct_requests");

  switch (modelId) {
    case "mistral-large-latest":
    case "mistral-small-latest":
      return hasFeature ? new MistralLLM({ model: modelConfiguration }) : null;
    case "claude-sonnet-4-5-20250929":
      return hasFeature
        ? new AnthropicLLM({
            model: modelConfiguration,
            options,
          })
        : null;
    default:
      return null;
  }
}
