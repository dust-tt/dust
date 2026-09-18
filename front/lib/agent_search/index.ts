import {
  AGENT_SEARCH_ALIAS_NAME,
  ElasticsearchError,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function makeAgentDocumentId({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): string {
  return `${workspaceId}_${agentId}`;
}

export async function indexAgentDocument(
  document: AgentSearchDocument
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const { active_users_count, ...fields } = document;
    await client.update({
      index: AGENT_SEARCH_ALIAS_NAME,
      id: makeAgentDocumentId({
        workspaceId: document.workspace_id,
        agentId: document.agent_id,
      }),
      doc: fields,
      upsert: { ...fields, active_users_count },
      retry_on_conflict: 3,
    });
  });
}

export async function deleteAgentDocument({
  workspaceId,
  agentId,
}: {
  workspaceId: string;
  agentId: string;
}): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    await client.deleteByQuery({
      index: AGENT_SEARCH_ALIAS_NAME,
      query: {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { term: { agent_id: agentId } },
          ],
        },
      },
      refresh: false,
    });
  });
}

export async function deleteWorkspaceAgentDocuments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    await client.deleteByQuery({
      index: AGENT_SEARCH_ALIAS_NAME,
      query: { term: { workspace_id: workspaceId } },
      refresh: false,
    });
  });
}

export async function updateAgentSearchActiveUsers({
  workspaceId,
  agentIds,
  activeUsers,
}: {
  workspaceId: string;
  agentIds: string[];
  activeUsers: Record<string, number>;
}): Promise<Result<void, ElasticsearchError>> {
  if (agentIds.length === 0) {
    return new Ok(undefined);
  }

  const operations = agentIds.flatMap((agentId) => [
    {
      update: {
        _index: AGENT_SEARCH_ALIAS_NAME,
        _id: makeAgentDocumentId({ workspaceId, agentId }),
        retry_on_conflict: 3,
      },
    },
    { doc: { active_users_count: activeUsers[agentId] ?? 0 } },
  ]);

  const bulkRes = await withEs((client) => client.bulk({ operations }));
  if (bulkRes.isErr()) {
    return bulkRes;
  }

  const failures = bulkRes.value.items.filter(
    (item) =>
      item.update?.error &&
      item.update.error.type !== "document_missing_exception"
  );
  if (failures.length > 0) {
    return new Err(
      new ElasticsearchError(
        "query_error",
        `Failed to update ${failures.length} agent usage snapshots`
      )
    );
  }

  return new Ok(undefined);
}
