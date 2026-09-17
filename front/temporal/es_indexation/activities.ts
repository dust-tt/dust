import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  deleteSkillDocument,
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
} from "@app/lib/skill_search";
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

/**
 * @cc [owner:aubin-tchoi,label:backend;security] searchable-skill-index-projection
 * Index active or archived custom skills, including those the internal admin cannot read.
 */
export async function indexSkillSearchActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const skill = await SkillResource.fetchById(auth, skillId, {
    permissionFiltering: "redact_unreadable",
    withInstructions: false,
    withTools: true,
    withFileAttachments: false,
  });
  // Suggested skills are not indexed: they have only been suggested and are not
  // ready to be used yet.
  if (!skill || skill.status === "suggested") {
    return;
  }

  const editors = await skill.listEditors(auth);
  let lastEditor = null;
  if (skill.editedBy) {
    lastEditor = await UserResource.fetchByModelId(skill.editedBy);
  }
  const document = skill.toSearchDocument(auth.getNonNullableWorkspace(), {
    editors: editors ?? [],
    lastEditedByUser: lastEditor,
    activeUsersCount: 0,
  });
  const result = await indexSkillDocument(document);
  if (result.isErr()) {
    throw result.error;
  }
}

export async function deleteSkillSearchActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId: string;
}): Promise<void> {
  const deleteResult = await deleteSkillDocument({ workspaceId, skillId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
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
