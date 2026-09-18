import type { AgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export const AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG: WhitelistableFeature =
  "agent_message_consumption_writes";
export const AGENT_MESSAGE_CONSUMPTION_BILLS_FLAG: WhitelistableFeature =
  "agent_message_consumption_bills";

/**
 * @cc [owner:id13,label:product;backend] credit-consumption-default-off
 * Credit consumption MUST remain off unless the writes feature flag is enabled.
 */
export function consumptionModeFromFeatureFlags(
  featureFlags: readonly WhitelistableFeature[]
): AgentMessageConsumptionMode {
  const writes = featureFlags.includes(AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG);
  const bills = featureFlags.includes(AGENT_MESSAGE_CONSUMPTION_BILLS_FLAG);
  if (!writes) {
    return "off";
  }
  return bills ? "live" : "shadow";
}
