import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { LLM } from "@app/lib/llm/llm";
import { MistralLLM } from "@app/lib/llm/providers/mistral";
import type { LLMOptions } from "@app/lib/llm/types/options";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";

export async function getLLM({
  auth,
  model,
  options,
}: {
  auth: Authenticator;
  model: ModelConfigurationType;
  options?: LLMOptions;
}): Promise<LLM | null> {
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const hasFeature = featureFlags.includes("llm_router_direct_requests");

  switch (model.providerId) {
    case "mistral": {
      return hasFeature
        ? new MistralLLM({
            model,
            options,
          })
        : null;
    }
    default:
      return null;
  }
}
