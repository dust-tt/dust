import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { publishConversationRelatedEvent } from "@app/lib/api/assistant/streaming/events";
import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentMessageRef } from "@app/types/assistant/agent_run";

async function storeAgentMessageConsumptionAttribution(
  authType: AuthenticatorType,
  message: AgentMessageRef
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);

  const result = await computeAndStoreAgentMessageConsumptionAttribution(
    auth,
    message
  );
  if (result.isErr()) {
    const { error } = result;

    logger.error(
      {
        error,
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentMessageId: message.agentMessageId,
      },
      "[ConsumptionAttribution] Failed to reconcile consumption attribution"
    );

    throw new Error(
      `[ConsumptionAttribution] Reconciliation failed: ${error.code} ${JSON.stringify(error.context)}`
    );
  }

  const consumptionUpdate = result.value;
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

/** Builds and bulk-upserts every billed consumption unit for one agent message. */
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

    throw error instanceof ElasticsearchError
      ? error
      : new Error(
          `[ConsumptionAnalytics] Consumption documents skipped: ${error.code} ${JSON.stringify(error.context)}`
        );
  }
}
