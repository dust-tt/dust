import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import logger from "@app/logger/logger";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";

function makeAgentMessageConsumptionAnalyticsDocumentId(
  document: Pick<
    AgentMessageConsumptionAnalyticsData,
    "agent_message_id" | "consumption_key" | "message_version" | "workspace_id"
  >
): string {
  return `${document.workspace_id}_${document.agent_message_id}_${document.message_version}_${document.consumption_key}`;
}

/** Bulk-upserts every consumption unit for one agent message. */
export async function storeAgentMessageConsumptionAnalyticsDocuments(
  documents: AgentMessageConsumptionAnalyticsData[]
): Promise<void> {
  if (documents.length === 0) {
    return;
  }

  const result = await withEs(async (client) => {
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
      refresh: false,
    });

    if (response.errors) {
      throw new Error("Elasticsearch bulk response contains failed items");
    }
  });

  if (result.isErr()) {
    const firstDocument = documents[0];
    logger.error(
      {
        error: result.error,
        workspaceId: firstDocument?.workspace_id,
        agentMessageId: firstDocument?.agent_message_id,
        documentCount: documents.length,
      },
      "[ConsumptionAnalytics] Failed to write consumption documents to ES"
    );
    throw new Error(`ES bulk write failed: ${result.error.message}`);
  }
}
