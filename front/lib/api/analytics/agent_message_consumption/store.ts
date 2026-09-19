import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  ElasticsearchError,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { AgentMessageConsumptionAnalyticsData } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function makeAgentMessageConsumptionAnalyticsDocumentId(
  document: Pick<
    AgentMessageConsumptionAnalyticsData,
    "agent_message_id" | "consumption_key" | "workspace_id"
  >
): string {
  return `${document.workspace_id}_${document.agent_message_id}_${document.consumption_key}`;
}

function versionedBulkResult(
  failedItems: {
    error?: { reason?: string | null };
    status?: number;
  }[]
): Result<{ versionConflictCount: number }, ElasticsearchError> {
  const versionConflictCount = failedItems.filter(
    (item) => item.status === 409
  ).length;
  const failure = failedItems.find((item) => item.status !== 409);
  if (!failure) {
    return new Ok({ versionConflictCount });
  }

  return new Err(
    new ElasticsearchError(
      "query_error",
      failure.error?.reason ??
        "Elasticsearch bulk response contains failed items",
      failure.status
    )
  );
}

export async function upsertVersionedAgentMessageConsumptionAnalyticsDocuments(
  documents: {
    document: AgentMessageConsumptionAnalyticsData;
    version: number;
  }[]
): Promise<Result<{ versionConflictCount: number }, ElasticsearchError>> {
  if (documents.length === 0) {
    return new Ok({ versionConflictCount: 0 });
  }

  const result = await withEs((client) =>
    client.bulk({
      body: documents.flatMap(({ document, version }) => [
        {
          index: {
            _index: CONSUMPTION_ANALYTICS_ALIAS_NAME,
            _id: makeAgentMessageConsumptionAnalyticsDocumentId(document),
            version,
            version_type: "external_gte",
          },
        },
        document,
      ]),
      refresh: false,
    })
  );
  if (result.isErr()) {
    return result;
  }
  if (!result.value.errors) {
    return new Ok({ versionConflictCount: 0 });
  }

  const failedItems = result.value.items.flatMap((item) => {
    const operation = item.index;
    return operation?.error ? [operation] : [];
  });
  return versionedBulkResult(failedItems);
}

export async function upsertAgentMessageConsumptionAnalyticsDocuments(
  documents: AgentMessageConsumptionAnalyticsData[]
): Promise<Result<void, ElasticsearchError>> {
  if (documents.length === 0) {
    return new Ok(undefined);
  }

  const result = await withEs((client) =>
    client.bulk({
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
    })
  );

  if (result.isErr()) {
    return result;
  }

  if (!result.value.errors) {
    return new Ok(undefined);
  }

  const failedItem = result.value.items.find(
    (item) => item.index?.error
  )?.index;

  return new Err(
    new ElasticsearchError(
      "query_error",
      failedItem?.error?.reason ??
        "Elasticsearch bulk response contains failed items",
      failedItem?.status
    )
  );
}
