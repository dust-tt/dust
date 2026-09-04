import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  launchDeleteWorkspaceSkillSearchWorkflow,
  launchIndexSkillSearchWorkflow,
} from "@app/temporal/es_indexation/client";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";

const SKILL_SEARCH_INDEXATION_CONCURRENCY = 8;

export async function launchSkillSearchIndexation({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const result = await launchIndexSkillSearchWorkflow({ workspaceId, skillId });
  if (result.isErr()) {
    throw result.error;
  }
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

export async function launchSkillsSearchIndexationForGroups({
  workspace,
  groupModelIds,
}: {
  workspace: LightWorkspaceType;
  groupModelIds: readonly ModelId[];
}): Promise<void> {
  const uniqueGroupModelIds = [...new Set(groupModelIds)];
  if (uniqueGroupModelIds.length === 0) {
    return;
  }

  const skillEditorGrants = await GroupPermissionResource.listForGroups(
    workspace,
    {
      groupModelIds: uniqueGroupModelIds,
      grantType: "editor",
      resourceType: "skill",
    }
  );
  const skillIds = [
    ...new Set(
      removeNulls(
        skillEditorGrants.map((grant) =>
          grant.resourceId > 0
            ? makeSId("skill", {
                id: grant.resourceId,
                workspaceId: workspace.id,
              })
            : null
        )
      )
    ),
  ];

  await launchSkillsSearchIndexation({
    workspaceId: workspace.sId,
    skillIds,
  });
}

export async function launchWorkspaceSkillSearchDeletion({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const result = await launchDeleteWorkspaceSkillSearchWorkflow({
    workspaceId,
  });
  if (result.isErr()) {
    throw result.error;
  }
}
