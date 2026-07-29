import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types/user";

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;

async function deleteOldSuggestedSkillsForWorkspace(
  workspace: LightWorkspaceType,
  cutoffDate: Date,
  logger: Logger,
  execute: boolean
): Promise<number> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const suggestedSkills = await SkillResource.listByWorkspace(auth, {
    status: "suggested",
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  const skillsToDelete = suggestedSkills.filter(
    (skill) => skill.createdAt < cutoffDate
  );

  if (skillsToDelete.length === 0) {
    return 0;
  }

  let nbSkillsDeleted = 0;

  for (const skill of skillsToDelete) {
    if (!execute) {
      nbSkillsDeleted++;
      continue;
    }

    const result = await skill.delete(auth);
    if (result.isErr()) {
      logger.error(
        { err: result.error, skillId: skill.sId },
        "Failed to delete suggested skill."
      );
      continue;
    }

    nbSkillsDeleted++;
  }

  logger.info(
    `${execute ? "Deleted" : "Would delete"} ${nbSkillsDeleted} suggested ` +
      `skills for workspace(${workspace.sId}).`
  );

  return nbSkillsDeleted;
}

makeScript(
  {
    concurrency: {
      type: "number",
      description: "The number of workspaces to process concurrently.",
      default: 16,
    },
    workspaceId: {
      type: "string",
      description: "A single workspace id.",
    },
  },
  async ({ concurrency, workspaceId, execute }, logger) => {
    const cutoffDate = new Date(Date.now() - THREE_MONTHS_MS);

    let totalDeleted = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        totalDeleted += await deleteOldSuggestedSkillsForWorkspace(
          workspace,
          cutoffDate,
          logger,
          execute
        );
      },
      { concurrency, wId: workspaceId }
    );

    logger.info(
      `${execute ? "Deleted" : "Would delete"} ${totalDeleted} suggested ` +
        `skills in total.`
    );
  }
);
