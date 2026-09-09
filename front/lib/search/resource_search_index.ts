import type {
  ElasticsearchBaseDocument,
  ElasticsearchError,
} from "@app/lib/api/elasticsearch";
import { withEs } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

function ensureDeletionCompleted(
  response: estypes.DeleteByQueryResponse
): void {
  if (
    response.timed_out ||
    (response.failures?.length ?? 0) > 0 ||
    (response.version_conflicts ?? 0) > 0
  ) {
    throw new Error("Resource search deletion did not complete");
  }
}

/**
 * @cc [owner:aubin-tchoi,label:backend;security] workspace-scoped-derived-index
 * All index operations identify the workspace; resource upserts preserve daily usage, and usage
 * refreshes update existing documents only so a deleted resource cannot be resurrected.
 */
export class ResourceSearchIndex<
  Document extends ElasticsearchBaseDocument & { active_users: number },
> {
  constructor(
    private readonly alias: string,
    private readonly idField: "skill_id" | "agent_id"
  ) {}

  async upsert(document: Document): Promise<Result<void, ElasticsearchError>> {
    const resourceId = document[this.idField];
    assert(
      isString(resourceId) &&
        resourceId.length > 0 &&
        document.workspace_id.length > 0
    );
    return withEs(async (client) => {
      const { active_users, ...fields } = document;
      await client.update({
        index: this.alias,
        id: `${document.workspace_id}_${resourceId}`,
        doc: fields,
        upsert: { ...fields, active_users },
        retry_on_conflict: 3,
      });
    });
  }

  async delete({
    workspaceId,
    resourceId,
  }: {
    workspaceId: string;
    resourceId: string;
  }): Promise<Result<void, ElasticsearchError>> {
    assert(workspaceId.length > 0 && resourceId.length > 0);
    return withEs(async (client) => {
      ensureDeletionCompleted(
        await client.deleteByQuery({
          index: this.alias,
          query: {
            bool: {
              filter: [
                { term: { workspace_id: workspaceId } },
                { term: { [this.idField]: resourceId } },
              ],
            },
          },
          refresh: false,
        })
      );
    });
  }

  async deleteWorkspace({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<Result<void, ElasticsearchError>> {
    assert(workspaceId.length > 0);
    return withEs(async (client) => {
      ensureDeletionCompleted(
        await client.deleteByQuery({
          index: this.alias,
          query: { term: { workspace_id: workspaceId } },
          refresh: false,
        })
      );
    });
  }

  async updateActiveUsers({
    workspaceId,
    resourceIds,
    activeUsers,
  }: {
    workspaceId: string;
    resourceIds: string[];
    activeUsers: Record<string, number>;
  }): Promise<Result<void, ElasticsearchError>> {
    assert(workspaceId.length > 0 && resourceIds.length <= 500);
    return withEs(async (client) => {
      if (resourceIds.length === 0) {
        return;
      }
      const operations = resourceIds.flatMap((resourceId) => [
        {
          update: {
            _index: this.alias,
            _id: `${workspaceId}_${resourceId}`,
            retry_on_conflict: 3,
          },
        },
        { doc: { active_users: activeUsers[resourceId] ?? 0 } },
      ]);
      const result = await client.bulk({ operations });
      const failures = result.items.filter(
        (item) =>
          item.update?.error &&
          item.update.error.type !== "document_missing_exception"
      );
      if (failures.length > 0) {
        throw new Error(
          `Failed to update ${failures.length} resource usage snapshots`
        );
      }
    });
  }
}
