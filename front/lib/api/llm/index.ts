import { GoogleLLM } from "@app/lib/api/llm/clients/google";
import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";
import type { ModelIdType } from "@app/types/assistant/models/types";

import { OpenAILLM } from "@app/lib/api/llm/clients/openai";
import { OpenAIPayload } from "@app/lib/api/llm/clients/openai/utils";

// Keep this until the list includes all the supported model IDs (cf SUPPORTED_MODEL_CONFIGS)
const WHITELISTED_MODEL_IDS: ModelIdType[] = [
  "mistral-large-latest",
  "mistral-small-latest",
  "gpt-4o",
  "gpt-5",
  "gemini-2.5-pro",
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
    case "gpt-4o":
    case "gpt-5":
      return hasFeature
        ? new OpenAILLM({ model: modelConfiguration, options } as OpenAIPayload)
        : null;
    case "gemini-2.5-pro":
      return hasFeature
        ? new GoogleLLM({ model: modelConfiguration, options })
        : null;
    default:
      return null;
  }
}
