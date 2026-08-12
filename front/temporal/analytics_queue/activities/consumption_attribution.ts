import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentMessageRef } from "@app/types/assistant/agent_run";

async function storeAgentMessageConsumptionAttribution(
  authType: AuthenticatorType,
  message: AgentMessageRef
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  const consumptionUpdate =
    await computeAndStoreAgentMessageConsumptionAttribution(auth, message);

  if (consumptionUpdate) {
    await publishConversationRelatedEvent({
      conversationId: message.conversationId,
      event: {
        type: "agent_message_consumption_updated",
        conversationId: message.conversationId,
        costCredits: consumptionUpdate.costCredits,
        created: Date.now(),
        messageId: message.agentMessageId,
      },
    });
  }
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

  // This activity retries independently from the attribution activity that precedes it in the
  // workflow. Refresh attribution on every attempt so a retry can observe facts committed after
  // the preceding activity (and so already-retrying workflows can apply newer attribution logic).
  await computeAndStoreAgentMessageConsumptionAttribution(auth, message);

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
