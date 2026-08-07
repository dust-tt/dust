import { buildAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/documents";
import { loadAgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import { replaceAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/store";
import type { Authenticator } from "@app/lib/auth";
import assert from "assert";

/**
 * Loads, projects, and indexes the complete consumption analytics snapshot for one agent message.
 * Callers only identify the message. This module owns the ordering and completeness requirements
 * of the indexed snapshot.
 */
export async function indexAgentMessageConsumptionAnalytics(
  auth: Authenticator,
  { agentMessageId }: { agentMessageId: string }
): Promise<void> {
  const input = await loadAgentMessageConsumptionAnalyticsInput(auth, {
    agentMessageId,
  });
  if (!input) {
    return;
  }

  const documents = buildAgentMessageConsumptionAnalyticsDocuments(input);
  assert(
    documents && documents.length > 0,
    "Consumption attribution is incomplete for analytics"
  );

  await replaceAgentMessageConsumptionAnalyticsDocuments({
    agentMessageId: input.agentMessageId,
    documents,
    workspaceId: input.workspaceId,
  });
}
