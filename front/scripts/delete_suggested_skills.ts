import type { Transaction } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillMCPServerConfigurationModel,
  SkillVersionModel,
} from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
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

  // Find all suggested skills
  const suggestedSkills = await SkillConfigurationModel.findAll({
    where: {
      workspaceId: workspace.id,
      status: "suggested",
    },
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
        { skillId: skill.id, skillName: skill.name },
        execute ? "Deleting suggested skill" : "Would delete skill (dry run)"
      );

      if (execute) {
        // Create an internal admin authenticator for the workspace
        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        // Use a transaction to ensure all deletions succeed or all are rolled back
        await frontSequelize.transaction(async (transaction: Transaction) => {
          // Find the editor group linked to this skill
          const groupSkillLinks = await GroupSkillModel.findAll({
            where: {
              skillConfigurationId: skill.id,
              workspaceId: workspace.id,
            },
            transaction,
          });

          logger.info(
            {
              skillId: skill.id,
              skillName: skill.name,
              groupCount: groupSkillLinks.length,
            },
            "Found group-skill links to delete"
          );

          // Delete all group-skill links
          for (const groupSkillLink of groupSkillLinks) {
            logger.info(
              {
                skillId: skill.id,
                skillName: skill.name,
                groupId: groupSkillLink.groupId,
              },
              "Deleting group-skill link"
            );
            await groupSkillLink.destroy({ transaction });
          }

          // Delete the associated editor groups
          for (const groupSkillLink of groupSkillLinks) {
            // Fetch the group to delete it
            const group = await GroupResource.fetchByModelId(
              groupSkillLink.groupId
            );

            if (group) {
              logger.info(
                {
                  skillId: skill.id,
                  skillName: skill.name,
                  groupId: group.id,
                  groupName: group.name,
                },
                "Deleting editor group"
              );

              // Delete the group
              const deleteResult = await group.delete(auth, { transaction });
              if (deleteResult.isErr()) {
                throw deleteResult.error;
              }
            } else {
              logger.warn(
                {
                  skillId: skill.id,
                  skillName: skill.name,
                  groupId: groupSkillLink.groupId,
                },
                "Group not found, already deleted"
              );
            }
          }

          // Delete data source configurations
          const deletedDataSourceConfigs =
            await SkillDataSourceConfigurationModel.destroy({
              where: {
                skillConfigurationId: skill.id,
                workspaceId: workspace.id,
              },
              transaction,
            });

          logger.info(
            {
              skillId: skill.id,
              skillName: skill.name,
              deletedDataSourceConfigs,
            },
            "Deleted data source configurations"
          );

          // Delete MCP server configurations
          const deletedMcpConfigs =
            await SkillMCPServerConfigurationModel.destroy({
              where: {
                skillConfigurationId: skill.id,
                workspaceId: workspace.id,
              },
              transaction,
            });

          logger.info(
            {
              skillId: skill.id,
              skillName: skill.name,
              deletedMcpConfigs,
            },
            "Deleted MCP server configurations"
          );

          // Delete skill versions
          const deletedVersions = await SkillVersionModel.destroy({
            where: {
              skillConfigurationId: skill.id,
              workspaceId: workspace.id,
            } as any,
            transaction,
          });

          logger.info(
            {
              skillId: skill.id,
              skillName: skill.name,
              deletedVersions,
            },
            "Deleted skill versions"
          );

          // Finally, delete the skill configuration itself
          await skill.destroy({ transaction });

          logger.info(
            {
              skillId: skill.id,
              skillName: skill.name,
              deletedDataSourceConfigs,
              deletedMcpConfigs,
              deletedVersions,
              deletedGroups: groupSkillLinks.length,
            },
            "Successfully deleted suggested skill and all related resources"
          );
        });
      }

      successCount++;
    } catch (error) {
      logger.error(
        {
          skillId: skill.id,
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
