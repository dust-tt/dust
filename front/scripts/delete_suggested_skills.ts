import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

/**
 * Deletes all suggested skills and their related resources.
 *
 * Usage:
 * From your local machine:
 * 1. Run the script on the pod from front:
 *    kubectl exec -it <pod-name> -n <namespace> -- npx tsx scripts/delete_suggested_skills.ts --workspaceSId <workspaceSId> --execute
 *
 * Or locally for testing:
 *    npx tsx scripts/delete_suggested_skills.ts --workspaceSId <workspaceSId> --execute
 */
async function deleteSuggestedSkills(
  logger: Logger,
  workspaceSId: string,
  execute: boolean
): Promise<void> {
  logger.info(
    { execute, workspaceSId },
    "Starting deletion of suggested skills"
  );

  // Find the workspace using the resource layer
  const workspace = await WorkspaceResource.fetchById(workspaceSId);

  if (!workspace) {
    throw new Error(`Workspace not found with sId: ${workspaceSId}`);
  }

  logger.info(
    { workspaceId: workspace.id, workspaceName: workspace.name },
    "Found workspace"
  );

  // Create an internal admin authenticator for the workspace
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Find all suggested skills using the resource layer
  const suggestedSkills = await SkillResource.listByWorkspace(auth, {
    status: "suggested",
    onlyCustom: true,
  });

  logger.info(
    { count: suggestedSkills.length },
    execute
      ? "Found suggested skills to delete"
      : "Would delete suggested skills (dry run)"
  );

  if (suggestedSkills.length === 0) {
    logger.info("No suggested skills found to delete");
    return;
  }

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ skillName: string; error: string }> = [];

  for (const skill of suggestedSkills) {
    try {
      logger.info(
        { skillModelId: skill.id, skillName: skill.name },
        execute ? "Deleting suggested skill" : "Would delete skill (dry run)"
      );

      if (execute) {
        const deleteResult = await skill.delete(auth);
        if (deleteResult.isErr()) {
          throw deleteResult.error;
        }

        logger.info(
          { skillModelId: skill.id, skillName: skill.name },
          "Successfully deleted suggested skill and all related resources"
        );
      }

      successCount++;
    } catch (error) {
      logger.error(
        {
          skillModelId: skill.id,
          skillName: skill.name,
          error,
        },
        "Failed to delete skill"
      );
      errorCount++;
      errors.push({
        skillName: skill.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info(
    {
      total: suggestedSkills.length,
      success: successCount,
      errors: errorCount,
    },
    "Deletion completed"
  );

  if (errors.length > 0) {
    logger.warn(
      { errors: errors.slice(0, 10) },
      `Deletion had ${errors.length} errors (showing first 10)`
    );
  }
}

makeScript(
  {
    workspaceSId: {
      alias: "w",
      describe: "Workspace sId where suggested skills should be deleted",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ workspaceSId, execute }, logger) => {
    await deleteSuggestedSkills(logger, workspaceSId, execute);
  }
);
