import {
  AGENT_MESSAGE_CONSUMPTION_BILLS_FLAG,
  AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG,
  consumptionModeFromFeatureFlags,
} from "@app/lib/api/assistant/consumption/mode";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionMode } from "@app/types/assistant/agent_message_consumption";

export { AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG } from "@app/lib/api/assistant/consumption/mode";

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
    featureFlags.includes(AGENT_MESSAGE_CONSUMPTION_BILLS_FLAG) &&
    !featureFlags.includes(AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG)
  ) {
    logger.error(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      "[Consumption] Billing flag is enabled without the writes flag."
    );
  }
  return consumptionModeFromFeatureFlags(featureFlags);
}
