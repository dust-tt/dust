import type { AgentMessageConsumptionMode } from "@app/lib/api/assistant/consumption/mode";
import {
  AGENT_MESSAGE_CONSUMPTION_BILLS_FLAG,
  AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG,
  consumptionModeFromFeatureFlags,
} from "@app/lib/api/assistant/consumption/mode";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";

export { AGENT_MESSAGE_CONSUMPTION_WRITES_FLAG } from "@app/lib/api/assistant/consumption/mode";

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

export function resolveAgentMessageConsumptionMode(
  auth: Authenticator,
  { mode }: { mode: AgentMessageConsumptionMode }
): AgentMessageConsumptionMode {
  if (mode === "off") {
    return mode;
  }
  if (mode === "live" && !auth.getNonNullableWorkspace().metronomeCustomerId) {
    logger.error(
      { workspaceId: auth.getNonNullableWorkspace().sId },
      "[Consumption] Live mode requires a Metronome customer."
    );
    return "shadow";
  }
  return mode;
}

export async function getAgentMessageConsumptionRolloutMode(
  auth: Authenticator,
  { rootAgentMessageId }: { rootAgentMessageId: string }
): Promise<AgentMessageConsumptionMode | null> {
  return ConversationResource.fetchAgentMessageConsumptionRolloutMode(auth, {
    agentMessageId: rootAgentMessageId,
  });
}
