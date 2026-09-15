import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  deleteWorkspaceSkillDocuments,
  indexSkillDocument,
} from "@app/lib/skill_search";
import { indexUserDocument } from "@app/lib/user_search";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { removeNulls } from "@app/types/shared/utils/general";
import uniq from "lodash/uniq";

const SKILL_SEARCH_INDEX_CONCURRENCY = 10;

export async function recreateUserSearchIndex({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const localLogger = logger.child({
    workspaceId,
  });

  localLogger.info("[User Search] Recreating user search index for workspace.");

  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  const lightWorkspace = renderLightWorkspaceType({ workspace });

  // Get all memberships for this workspace.
  const { memberships } = await MembershipResource.getLatestMemberships({
    workspace: lightWorkspace,
  });

  // Filter out revoked memberships - only index active members.
  const activeMemberships = memberships.filter((m) => !m.isRevoked());

  localLogger.info(
    {
      totalMemberships: memberships.length,
      activeMemberships: activeMemberships.length,
    },
    "[User Search] Found memberships to index"
  );

  let successCount = 0;
  let errorCount = 0;
  const users = await UserResource.fetchByModelIds([
    ...new Set(activeMemberships.map((m) => m.userId)),
  ]);
  const userByModelId = new Map(users.map((user) => [user.id, user]));

  await concurrentExecutor(
    activeMemberships,
    async (membership) => {
      const user = userByModelId.get(membership.userId);
      if (!user) {
        localLogger.warn(
          {
            membershipId: membership.id,
            userId: membership.userId,
          },
          "[User Search] User not found for membership"
        );
        errorCount++;
        return;
      }

      const document = user.toUserSearchDocument(lightWorkspace);
      const result = await indexUserDocument(document);

      if (result.isErr()) {
        localLogger.error(
          {
            userId: user.sId,
            error: result.error,
          },
          "[User Search] Failed to index user document"
        );
        errorCount++;
      } else {
        successCount++;
      }
    },
    { concurrency: 10 }
  );

  localLogger.info(
    {
      successCount,
      errorCount,
      totalIndexed: activeMemberships.length,
    },
    "[User Search] Completed user search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} users for workspace ${workspaceId}`
    );
  }
}

export async function recreateSkillSearchIndex({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const localLogger = logger.child({ workspaceId });
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

  localLogger.info(
    "[Skill Search] Recreating skill search index for workspace."
  );

  const deleteResult = await deleteWorkspaceSkillDocuments({ workspaceId });
  if (deleteResult.isErr()) {
    throw deleteResult.error;
  }

  const skills = await SkillResource.listByWorkspace(auth, {
    status: ["active", "archived"],
    onlyCustom: true,
    withInstructions: false,
    withTools: true,
    withFileAttachments: false,
  });
  const editorsBySkillId = await SkillResource.batchListEditors(auth, skills);
  const lastEditors = await UserResource.fetchByModelIds(
    uniq(removeNulls(skills.map((skill) => skill.editedBy)))
  );
  const lastEditorByModelId = new Map(
    lastEditors.map((user) => [user.id, user])
  );
  const workspace = auth.getNonNullableWorkspace();
  const results = await concurrentExecutor(
    skills,
    async (skill) => {
      const document = skill.toSearchDocument(workspace, {
        editorIds: (editorsBySkillId.get(skill.sId) ?? []).map(
          (editor) => editor.sId
        ),
        lastEditedByUserId:
          skill.editedBy === null
            ? null
            : (lastEditorByModelId.get(skill.editedBy)?.sId ?? null),
        activeUsersCount: 0,
      });
      const result = await indexSkillDocument(document);
      if (result.isErr()) {
        localLogger.error(
          { error: result.error, skillId: document.skill_id },
          "[Skill Search] Failed to index skill document"
        );
      }
      return result.isOk();
    },
    { concurrency: SKILL_SEARCH_INDEX_CONCURRENCY }
  );
  const indexedCount = results.filter(Boolean).length;
  const errorCount = results.length - indexedCount;

  localLogger.info(
    { errorCount, indexedCount },
    "[Skill Search] Completed skill search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} skills for workspace ${workspaceId}`
    );
  }
}
