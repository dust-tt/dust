import * as fs from "fs";
import * as path from "path";

import { SkillConfigurationModel } from "@app/lib/models/skill";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

interface SkillData {
  name: string;
  agentFacingDescription: string;
  userFacingDescription: string;
  instructions: string;
  requiredTools?: Array<{
    sid: string;
    name: string;
  }>;
}

/**
 * Creates suggested skills from a JSON file.
 *
 * Usage:
 * From your local machine:
 * 1. Copy the JSON file to the pod:
 *    kubectl cp front/scripts/suggested_skills/dust/top_suggested_skills.json <pod-name>:/tmp/skills.json -n <namespace>
 *
 * 2. Run the script on the pod:
 *    kubectl exec -it <pod-name> -n <namespace> -- npm run migrate -- --file-path /tmp/skills.json --workspace-sid <workspace-sid> --execute
 *
 * Or locally for testing:
 *    npm run migrate -- --file-path ./front/scripts/suggested_skills/dust/top_suggested_skills.json --workspace-sid <workspace-sid>
 */
async function createSuggestedSkills(
  logger: Logger,
  filePath: string,
  workspaceSId: string,
  execute: boolean
): Promise<void> {
  logger.info(
    { execute, filePath, workspaceSId },
    "Starting creation of suggested skills"
  );

  // Resolve the file path
  const resolvedPath = path.resolve(filePath);
  logger.info({ resolvedPath }, "Resolved file path");

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  // Read and parse the JSON file
  const fileContent = fs.readFileSync(resolvedPath, "utf-8");
  const skills: SkillData[] = JSON.parse(fileContent);

  logger.info({ count: skills.length }, "Parsed skills from file");

  // Find the workspace
  const workspace = await WorkspaceModel.findOne({
    where: { sId: workspaceSId },
    attributes: ["id", "sId", "name"],
  });

  if (!workspace) {
    throw new Error(`Workspace not found with sId: ${workspaceSId}`);
  }

  logger.info(
    { workspaceId: workspace.id, workspaceName: workspace.name },
    "Found workspace"
  );

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ skillName: string; error: string }> = [];

  for (const skill of skills) {
    try {
      // Check if skill already exists
      const existingSkill = await SkillConfigurationModel.findOne({
        where: {
          workspaceId: workspace.id,
          name: skill.name,
        },
      });

      if (existingSkill) {
        logger.warn(
          { skillName: skill.name, existingStatus: existingSkill.status },
          "Skill already exists, skipping"
        );
        errorCount++;
        errors.push({
          skillName: skill.name,
          error: "Skill already exists",
        });
        continue;
      }

      logger.info(
        { skillName: skill.name },
        execute
          ? "Creating suggested skill"
          : "Would create suggested skill (dry run)"
      );

      if (execute) {
        // Create the skill with status "suggested" and no author
        await SkillConfigurationModel.create({
          workspaceId: workspace.id,
          name: skill.name,
          agentFacingDescription: skill.agentFacingDescription,
          userFacingDescription: skill.userFacingDescription,
          instructions: skill.instructions,
          status: "suggested",
          authorId: null,
          requestedSpaceIds: [], // Empty array for suggested skills initially
          icon: null,
          extendedSkillId: null,
        });
      }

      successCount++;
    } catch (error) {
      logger.error(
        {
          skillName: skill.name,
          error,
        },
        "Failed to create skill"
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
      total: skills.length,
      success: successCount,
      errors: errorCount,
    },
    "Migration completed"
  );

  if (errors.length > 0) {
    logger.warn(
      { errors: errors.slice(0, 10) },
      `Migration had ${errors.length} errors (showing first 10)`
    );
  }
}

makeScript(
  {
    filePath: {
      alias: "f",
      describe: "Path to the JSON file containing skills",
      type: "string" as const,
      demandOption: true,
    },
    workspaceSId: {
      alias: "w",
      describe: "Workspace sId where skills should be created",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ filePath, workspaceSId, execute }, logger) => {
    await createSuggestedSkills(logger, filePath, workspaceSId, execute);
  }
);
