import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const OPENAI_CONCISE_REASONING_SUMMARIES =
  "openai_concise_reasoning_summaries" as const satisfies WhitelistableFeature;

export function withConciseOpenAIReasoningSummary(
  config: InputConfig,
  featureFlags: WhitelistableFeature[]
): InputConfig {
  if (!featureFlags.includes(OPENAI_CONCISE_REASONING_SUMMARIES)) {
    return config;
  }

  return { ...config, conciseReasoningSummary: true };
}
