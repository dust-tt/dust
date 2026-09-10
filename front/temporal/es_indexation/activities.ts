import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  deleteSkillDocument,
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
  updateSkillSearchActiveUsers,
} from "@app/lib/skill_search";
import {
  fetchSearchActiveUsers,
  storeCodeDefinedSkillActiveUsers,
} from "@app/lib/skill_search/usage";
import { deleteUserDocument, indexUserDocument } from "@app/lib/user_search";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";

export async function indexUserSearchActivity({
  userId,
}: {
  userId: string;
}): Promise<void> {
  const user = await UserResource.fetchById(userId);
  if (!user) {
    logger.warn({ userId }, `[user_search] User not found (likely scrubbed)`);
    return;
  }

  // Get all memberships for this user
  const { memberships } = await MembershipResource.getLatestMemberships({
    users: [user],
  });
  const workspaces = await WorkspaceResource.fetchByModelIds([
    ...new Set(memberships.map((m) => m.workspaceId)),
  ]);
  const workspaceByModelId = new Map(
    workspaces.map((workspace) => [workspace.id, workspace])
  );

  // Process each membership
  for (const membership of memberships) {
    const workspace = workspaceByModelId.get(membership.workspaceId);
    if (!workspace) {
      logger.warn(
        { membershipId: membership.id, workspaceId: membership.workspaceId },
        `[user_search] Failed to retrieve workspace (likely scrubbed)`
      );
      continue;
    }

    if (membership.isRevoked()) {
      // If we didn't find the workspace (scrubbed) or membership is revoked, remove user from index
      const deleteResult = await deleteUserDocument({
        workspaceId: workspace.sId,
        userId: user.sId,
      });
      if (deleteResult.isErr()) {
        // Log but don't fail - user might not be in index
        logger.warn(
          {
            userId: user.sId,
            workspaceId: workspace.sId,
            error: deleteResult.error,
          },
          `[user_search] Failed to de-index user for workspace`
        );
      }
    } else {
      // Membership is active, index user in this workspace
      const document = user.toUserSearchDocument(
        renderLightWorkspaceType({ workspace, role: membership.role })
      );
      const indexResult = await indexUserDocument(document);
      if (indexResult.isErr()) {
        logger.error(
          {
            userId: user.sId,
            workspaceId: workspace.sId,
            error: indexResult.error,
          },
          `[user_search] Failed to index user for workspace`
        );
        throw new Error(
          `Failed to index user ${user.sId} in workspace ${workspace.sId}: ${indexResult.error.message}`
        );
      }
    }
  }
}

export async function indexSkillSearchActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const document = await SkillSearchDocumentResource.fetchSearchDocument(
    auth,
    skillId
  );

  if (!document) {
    const deleteResult = await deleteSkillDocument({ workspaceId, skillId });
    if (deleteResult.isErr()) {
      throw deleteResult.error;
    }
    return;
  }

  const indexResult = await indexSkillDocument(document);
  if (indexResult.isErr()) {
    throw indexResult.error;
  }
}

export async function deleteWorkspaceSkillSearchActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const deleteResult = await deleteWorkspaceSkillDocuments({ workspaceId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }
}

export async function listSearchUsageWorkspacesActivity(
  afterWorkspaceModelId: number
) {
  return WorkspaceResource.unsafeListWorkspaceIdBatchAfterModelId({
    lastWorkspaceModelId: afterWorkspaceModelId,
    limit: 50,
  });
}

export async function refreshWorkspaceSearchUsageActivity({
  workspaceId,
  evaluatedAtMs,
}: {
  workspaceId: string;
  evaluatedAtMs: number;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const activeUsers = await fetchSearchActiveUsers({
    workspaceId,
    evaluatedAtMs,
  });
  if (activeUsers.isErr()) {
    throw activeUsers.error;
  }
  let afterSkillModelId: number | null = null;
  // Keyset pages, not one query per skill; missing usage resets to zero on every page.
  while (true) {
    const skills =
      await SkillSearchDocumentResource.listActiveSearchIndexSkillIds(auth, {
        afterSkillModelId,
        limit: 500,
      });
    if (skills.length === 0) {
      break;
    }
    const updated = await updateSkillSearchActiveUsers({
      workspaceId,
      skillIds: skills.map((skill) => skill.skillId),
      activeUsers: activeUsers.value,
    });
    if (updated.isErr()) {
      throw updated.error;
    }
    afterSkillModelId = skills[skills.length - 1].skillModelId;
  }
  await storeCodeDefinedSkillActiveUsers(workspaceId, activeUsers.value);
}
