import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentMessageRef } from "@app/types/assistant/agent_run";

async function storeAgentMessageConsumptionAttribution(
  authType: AuthenticatorType,
  message: AgentMessageRef
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  await computeAndStoreAgentMessageConsumptionAttribution(auth, message);
}

export async function storeAgentMessageConsumptionAttributionForMessageActivity(
  authType: AuthenticatorType,
  { message }: { message: AgentMessageRef }
): Promise<void> {
  await storeAgentMessageConsumptionAttribution(authType, message);
}

/** Builds and bulk-upserts every billed consumption unit for one settled agent message. */
export async function storeAgentMessageConsumptionAnalyticsActivity(
  authType: AuthenticatorType,
  { message }: { message: AgentMessageRef }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const result = await indexAgentMessageConsumptionAnalytics(auth, {
    agentMessageId: message.agentMessageId,
  });

  if (result.isErr()) {
    const { error } = result;
    const workspaceId = auth.getNonNullableWorkspace().sId;

    logger.error(
      {
        error,
        workspaceId,
        agentMessageId: message.agentMessageId,
      },
      "[ConsumptionAnalytics] Failed to upsert consumption documents in ES"
    );

    throw error;
  }
}
