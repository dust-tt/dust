import {
  ElasticsearchError,
  SKILL_SEARCH_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

export function makeSkillDocumentId({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): string {
  return `${workspaceId}_${skillId}`;
}

export async function indexSkillDocument(
  document: SkillSearchDocument
): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const { active_users_count, ...fields } = document;
    await client.update({
      index: SKILL_SEARCH_ALIAS_NAME,
      id: makeSkillDocumentId({
        workspaceId: document.workspace_id,
        skillId: document.skill_id,
      }),
      doc: fields,
      upsert: { ...fields, active_users_count },
      retry_on_conflict: 3,
    });
  });
}

export async function deleteSkillDocument({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    await client.deleteByQuery({
      index: SKILL_SEARCH_ALIAS_NAME,
      query: {
        bool: {
          filter: [
            { term: { workspace_id: workspaceId } },
            { term: { skill_id: skillId } },
          ],
        },
      },
      refresh: false,
    });
  });
}

export async function deleteWorkspaceSkillDocuments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    await client.deleteByQuery({
      index: SKILL_SEARCH_ALIAS_NAME,
      query: { term: { workspace_id: workspaceId } },
      refresh: false,
    });
  });
}

export async function updateSkillSearchActiveUsers({
  workspaceId,
  skills,
  activeUsers,
}: {
  workspaceId: string;
  skills: SkillResource[];
  activeUsers: Record<string, number>;
}): Promise<Result<void, ElasticsearchError>> {
  const skillIds = skills.map((skill) => skill.sId);
  if (skillIds.length === 0) {
    return new Ok(undefined);
  }

  const operations = skillIds.flatMap((skillId) => [
    {
      update: {
        _index: SKILL_SEARCH_ALIAS_NAME,
        _id: makeSkillDocumentId({ workspaceId, skillId }),
        retry_on_conflict: 3,
      },
    },
    { doc: { active_users_count: activeUsers[skillId] ?? 0 } },
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
        `Failed to update ${failures.length} skill usage snapshots`
      )
    );
  }

  return new Ok(undefined);
}
