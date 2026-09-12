import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { SKILL_SEARCH_ALIAS_NAME, withEs } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";

function ensureDeleteByQueryCompleted(
  response: estypes.DeleteByQueryResponse
): void {
  const failureCount = response.failures?.length ?? 0;
  const versionConflictCount = response.version_conflicts ?? 0;
  if (response.timed_out || failureCount > 0 || versionConflictCount > 0) {
    throw new Error(
      `Skill search deletion did not complete: timedOut=${response.timed_out ?? false}, failures=${failureCount}, versionConflicts=${versionConflictCount}`
    );
  }
}

function makeSkillDocumentId({
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
  const documentId = makeSkillDocumentId({
    workspaceId: document.workspace_id,
    skillId: document.skill_id,
  });

  return withEs(async (client) => {
    await client.index({
      index: SKILL_SEARCH_ALIAS_NAME,
      id: documentId,
      body: document,
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
    ensureDeleteByQueryCompleted(response);
  });
}

export async function deleteWorkspaceSkillDocuments({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<Result<void, ElasticsearchError>> {
  return withEs(async (client) => {
    const response = await client.deleteByQuery({
      index: SKILL_SEARCH_ALIAS_NAME,
      query: {
        term: { workspace_id: workspaceId },
      },
      refresh: false,
    });
    ensureDeleteByQueryCompleted(response);
  });
}
