import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
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

/**
 * @cc [owner:id13,label:product;backend] credit-consumption-mode-switch
 * The mode switch MUST preserve legacy billing in off and shadow modes; live mode is the only
 * mode allowed to replace it.
 */
export async function getAgentMessageConsumptionMode(
  auth: Authenticator
): Promise<AgentMessageConsumptionMode> {
  const featureFlags = await getFeatureFlags(auth);
  if (
    featureFlags.includes("agent_message_consumption_bills") &&
    !featureFlags.includes("agent_message_consumption_writes")
  ) {
    logger.error(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      "[Consumption] Billing flag is enabled without the writes flag."
    );
  }
  return consumptionModeFromFeatureFlags(featureFlags);
}
