import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { launchIndexSkillSearchWorkflow } from "@app/temporal/es_indexation/client";
import type { GrantSpec } from "@app/types/group_permissions";
import type { LightWorkspaceType } from "@app/types/user";
import type { Transaction } from "sequelize";

const SKILL_SEARCH_INDEXATION_CONCURRENCY = 8;

/**
 * @cc [owner:aubin-tchoi,label:backend;security] skill-editor-indexation
 * Non-transactional editor grant and membership changes refresh only affected workspace skills;
 * removed grants remain valid targets, and unrelated grant kinds never fan out.
 */
export async function launchSkillSearchIndexationForGrants(
  {
    workspace,
    grants,
  }: { workspace: LightWorkspaceType; grants: readonly GrantSpec[] },
  { transaction }: { transaction?: Transaction } = {}
): Promise<void> {
  // A resource that owns a transaction schedules its refresh after its writes complete.
  if (transaction) {
    return;
  }
  const skillIds = [
    ...new Set(
      grants
        .filter(
          (grant) =>
            grant.grantType === "editor" &&
            grant.resourceType === "skill" &&
            grant.resourceId > 0
        )
        .map((grant) =>
          makeSId("skill", {
            id: grant.resourceId,
            workspaceId: workspace.id,
          })
        )
    ),
  ];
  if (skillIds.length === 0) {
    return;
  }
  await launchSkillsSearchIndexation({ workspaceId: workspace.sId, skillIds });
}

export async function launchSkillsSearchIndexation({
  workspaceId,
  skillIds,
}: {
  workspaceId: string;
  skillIds: readonly string[];
}): Promise<void> {
  const results = await concurrentExecutor(
    skillIds,
    (skillId) => launchIndexSkillSearchWorkflow({ workspaceId, skillId }),
    { concurrency: SKILL_SEARCH_INDEXATION_CONCURRENCY }
  );
  const failedResult = results.find((result) => result.isErr());
  if (failedResult?.isErr()) {
    throw failedResult.error;
  }
}
