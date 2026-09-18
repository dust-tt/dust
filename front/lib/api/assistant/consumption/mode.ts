import type { AgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

/**
 * @cc [owner:id13,label:product;backend] credit-consumption-default-off
 * Credit consumption MUST remain off unless the writes feature flag is enabled.
 */
export function consumptionModeFromFeatureFlags(
  featureFlags: readonly WhitelistableFeature[]
): AgentMessageConsumptionMode {
  const writes = featureFlags.includes("agent_message_consumption_writes");
  const bills = featureFlags.includes("agent_message_consumption_bills");
  if (!writes) {
    return "off";
  }
  return bills ? "live" : "shadow";
}
