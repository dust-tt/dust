import { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
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
import type { ModelId } from "@app/types/shared/model_id";

const SKILL_SEARCH_BATCH_SIZE = 500;
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

  let afterSkillModelId: ModelId | null = null;
  let indexedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  while (true) {
    const skills =
      await SkillSearchDocumentResource.listActiveSearchIndexSkillIds(auth, {
        afterSkillModelId,
        limit: SKILL_SEARCH_BATCH_SIZE,
      });
    if (skills.length === 0) {
      break;
    }

    afterSkillModelId = skills[skills.length - 1].skillModelId;
    const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      skills.map(({ skillId }) => skillId)
    );
    const documentBySkillId = new Map(
      documents.map((document) => [document.skill_id, document])
    );
    const results = await concurrentExecutor(
      skills,
      async ({ skillId }) => {
        const document = documentBySkillId.get(skillId);
        if (!document) {
          localLogger.warn(
            { skillId },
            "[Skill Search] Skipping skill that is no longer active"
          );
          return "skipped" as const;
        }

        const indexResult = await indexSkillDocument(document);
        if (indexResult.isErr()) {
          localLogger.error(
            { error: indexResult.error, skillId },
            "[Skill Search] Failed to index skill document"
          );
          return "failed" as const;
        }

        return "indexed" as const;
      },
      { concurrency: SKILL_SEARCH_INDEX_CONCURRENCY }
    );

    indexedCount += results.filter((result) => result === "indexed").length;
    skippedCount += results.filter((result) => result === "skipped").length;
    errorCount += results.filter((result) => result === "failed").length;

    localLogger.info(
      { afterSkillModelId, errorCount, indexedCount, skippedCount },
      "[Skill Search] Recreated skill search index batch"
    );
  }

  localLogger.info(
    { errorCount, indexedCount, skippedCount },
    "[Skill Search] Completed skill search index recreation for workspace"
  );

  if (errorCount > 0) {
    throw new Error(
      `Failed to index ${errorCount} skills for workspace ${workspaceId}`
    );
  }
}
