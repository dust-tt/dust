import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

const OPENAI_FLEX_PROCESSING =
  "openai_flex_processing" as const satisfies WhitelistableFeature;

// Trigger- and wake-up-driven runs: nobody is waiting on the answer in real
// time, so they are the runs we are willing to trade latency for cost on.
const LATENCY_TOLERANT_ORIGINS: ReadonlySet<UserMessageOrigin> =
  new Set<UserMessageOrigin>(["triggered", "triggered_programmatic", "wakeup"]);

/**
 * Asks for OpenAI flex processing on endpoints that accept it.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:product;error-handling] flex-never-requested-on-retry
 * When `isRetry` is true, the returned config MUST keep the caller's `serviceTier` (the provider
 * default, in practice) instead of asking for `flex`. Flex is best-effort capacity that can be
 * refused or time out, so a retry only buys the run something if it runs on standard capacity.
 */
export function withFlexProcessing(
  config: InputConfig,
  {
    featureFlags,
    isRetry,
    userMessageOrigin,
  }: {
    featureFlags: WhitelistableFeature[];
    isRetry: boolean;
    userMessageOrigin: UserMessageOrigin | undefined;
  }
): InputConfig {
  const isLatencyTolerant =
    userMessageOrigin !== undefined &&
    LATENCY_TOLERANT_ORIGINS.has(userMessageOrigin);

  if (
    isRetry ||
    !featureFlags.includes(OPENAI_FLEX_PROCESSING) ||
    !isLatencyTolerant
  ) {
    return config;
  }

  return { ...config, serviceTier: "flex" };
}
