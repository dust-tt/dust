import { Authenticator } from "@app/lib/auth";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ApplicationFailure } from "@temporalio/common";

export async function getAuthForWorkspace(
  workspaceId: string
): Promise<Authenticator> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceId}`
    );
  }
  // The auth needs access to all groups to access conversations in projects.
  return Authenticator.internalAdminForWorkspace(workspaceId, {
    dangerouslyRequestAllGroups: true,
  });
}

export async function recordSkillReinforcementAnalysisCompletion(
  auth: Authenticator,
  skillId: string
): Promise<void> {
  const modelId = getResourceIdFromSId(skillId);
  if (modelId === null) {
    return;
  }

  await SkillConfigurationModel.update(
    { lastReinforcementAnalysisAt: new Date() },
    {
      where: {
        id: modelId,
        workspaceId: auth.getNonNullableWorkspace().id,
        status: "active",
      },
    }
  );
}
