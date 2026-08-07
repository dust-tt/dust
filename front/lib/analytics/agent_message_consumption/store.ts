import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import assert from "assert";

function makeAgentMessageConsumptionAnalyticsDocumentId(
  document: Pick<
    AgentMessageConsumptionAnalyticsData,
    "agent_message_id" | "consumption_key" | "message_version" | "workspace_id"
  >
): string {
  return `${document.workspace_id}_${document.agent_message_id}_${document.message_version}_${document.consumption_key}`;
}

/** Replaces the complete indexed consumption snapshot for one agent message. */
export async function replaceAgentMessageConsumptionAnalyticsDocuments({
  agentMessageId,
  documents,
  workspaceId,
}: {
  agentMessageId: string;
  documents: AgentMessageConsumptionAnalyticsData[];
  workspaceId: string;
}): Promise<void> {
  assert(
    documents.every(
      (document) =>
        document.agent_message_id === agentMessageId &&
        document.workspace_id === workspaceId
    ),
    "Consumption documents belong to different agent messages"
  );

  const result = await withEs(async (client) => {
    const deleteResponse = await client.deleteByQuery({
      index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
      query: {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { term: { agent_message_id: agentMessageId } },
          ],
        },
      },
      refresh: documents.length === 0,
    });
    assert(
      (deleteResponse.failures?.length ?? 0) === 0 &&
        (deleteResponse.version_conflicts ?? 0) === 0,
      "Elasticsearch failed to delete the previous consumption snapshot"
    );

    if (documents.length === 0) {
      return;
    }

    const response = await client.bulk({
      body: documents.flatMap((document) => [
        {
          index: {
            _index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
            _id: makeAgentMessageConsumptionAnalyticsDocumentId(document),
          },
        },
        document,
      ]),
      // Wait until this snapshot is searchable so a following replacement can delete it.
      refresh: "wait_for",
    });

    assert(
      !response.errors,
      "Elasticsearch bulk response contains failed items"
    );
  });

  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
        workspaceId,
        agentMessageId,
        documentCount: documents.length,
      },
      "[ConsumptionAnalytics] Failed to replace consumption documents in ES"
    );
  }

  assert(result.isOk(), "Failed to replace consumption analytics snapshot");
}
