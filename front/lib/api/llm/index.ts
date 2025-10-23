import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMOptions } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
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
  const _hasFeature = featureFlags.includes("llm_router_direct_requests");

  switch (modelId) {
    default:
      return null;
  }
}
