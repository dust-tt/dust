import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { SKILL_STATUSES } from "@app/types/assistant/skill_configuration";
import type { LightWorkspaceType } from "@app/types/user";

// Backfill: (re-)derive every skill's group_permissions from its group_skills association. The
// write goes through SkillResource.reconcileGroupPermissions, which delegates to the same
// writeGroupPermissions the skill mutation paths use, so the backfill and the ongoing writes can
// never disagree. Idempotent (clears + re-inserts), so it is safe to re-run if grants get corrupted.
async function backfillWorkspaceSkillGroupPermissions(
  execute: boolean,
  logger: Logger,
  workspace: LightWorkspaceType
): Promise<void> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Every status: archived and suggested skills keep their editor group, so their grants must be
  // written too (an archived skill can be restored). `onlyCustom` skips the code-defined
  // global/system skills: they have no editor group and no row to key grants on (their `id` is
  // faked to -1, which is the type-wide sentinel).
  const skills = await SkillResource.listByWorkspace(auth, {
    status: [...SKILL_STATUSES],
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  await concurrentExecutor(
    skills,
    async (skill) => {
      const editorGroupId = skill.editorGroup?.id ?? null;

      if (!execute) {
        logger.info(
          {
            workspaceId: workspace.sId,
            skillId: skill.sId,
            skillStatus: skill.status,
            editorGroupId,
          },
          "Dry-run: would reconcile skill group permissions"
        );
        return;
      }

      // One transaction per skill so a skill is never left without its grants mid-reconcile.
      await frontSequelize.transaction(async (transaction) => {
        await skill.reconcileGroupPermissions(auth, { transaction });
      });

      logger.info(
        {
          workspaceId: workspace.sId,
          skillId: skill.sId,
          skillStatus: skill.status,
          editorGroupId,
        },
        "Reconciled skill group permissions"
      );
    },
    { concurrency: 4 }
  );
}

makeScript(
  {
    wId: { type: "string", required: false },
  },
  async ({ wId, execute }, logger) => {
    logger.info("Starting skill group_permissions backfill");

    if (wId) {
      const ws = await WorkspaceResource.fetchById(wId);
      if (!ws) {
        throw new Error(`Workspace not found: ${wId}`);
      }
      await backfillWorkspaceSkillGroupPermissions(
        execute,
        logger,
        renderLightWorkspaceType({ workspace: ws })
      );
    } else {
      await runOnAllWorkspaces(
        async (workspace) => {
          await backfillWorkspaceSkillGroupPermissions(
            execute,
            logger,
            workspace
          );
        },
        { concurrency: 4 }
      );
    }

    logger.info("Skill group_permissions backfill completed");
  }
);
