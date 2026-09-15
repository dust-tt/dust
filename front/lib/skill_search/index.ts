import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
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
    throw new Error("Skill search deletion did not complete");
  }
}

export async function indexSkillDocument(
  document: SkillSearchDocument
): Promise<Result<void, ElasticsearchError>> {
  const skillId = document.skill_id;
  assert(
    isString(skillId) && skillId.length > 0 && document.workspace_id.length > 0
  );
  return withEs(async (client) => {
    const { active_users_count, ...fields } = document;
    await client.update({
      index: SKILL_SEARCH_ALIAS_NAME,
      id: `${document.workspace_id}_${skillId}`,
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
  assert(workspaceId.length > 0 && skillId.length > 0);
  return withEs(async (client) => {
    const response = await client.deleteByQuery({
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
    ensureDeletionCompleted(response);
  });
}

export async function deleteWorkspaceSkillDocuments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<void, ElasticsearchError>> {
  assert(workspaceId.length > 0);
  return withEs(async (client) => {
    const response = await client.deleteByQuery({
      index: SKILL_SEARCH_ALIAS_NAME,
      query: { term: { workspace_id: workspaceId } },
      refresh: false,
    });
    ensureDeletionCompleted(response);
  });
}
