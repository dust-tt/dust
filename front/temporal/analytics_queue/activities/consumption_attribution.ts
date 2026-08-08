import { indexAgentMessageConsumptionAnalytics } from "@app/lib/analytics/agent_message_consumption";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";

export async function storeAgentMessageConsumptionAttributionActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const { agentMessageId, conversationId } = agentLoopArgs;

  await computeAndStoreAgentMessageConsumptionAttribution(auth, {
    agentMessageId,
    conversationId,
  });
}

/** Builds and bulk-upserts every billed consumption unit for one settled agent message. */
export async function storeAgentMessageConsumptionAnalyticsActivity(
  authType: AuthenticatorType,
  {
    agentLoopArgs,
  }: {
    agentLoopArgs: AgentLoopArgs;
  }
): Promise<void> {
  const auth = await Authenticator.fromJSON(authType);
  const result = await indexAgentMessageConsumptionAnalytics(auth, {
    agentMessageId: agentLoopArgs.agentMessageId,
  });

  if (result.isErr()) {
    const { error } = result;
    const workspaceId = auth.getNonNullableWorkspace().sId;

    logger.error(
      {
        error,
        workspaceId,
        agentMessageId: agentLoopArgs.agentMessageId,
      },
      "[ConsumptionAnalytics] Failed to upsert consumption documents in ES"
    );

    throw error;
  }
}
