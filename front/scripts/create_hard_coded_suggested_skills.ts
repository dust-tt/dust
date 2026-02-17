import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import {
  SkillConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { AGENT_GROUP_PREFIX } from "@app/types/groups";
import type { ModelId } from "@app/types/shared/model_id";
import type { LightWorkspaceType } from "@app/types/user";
import * as fs from "fs";
import * as path from "path";
import type { Transaction } from "sequelize";
import { z } from "zod";

const SkillToolSchema = z.object({
  tool_name: z.string(),
  tool_type: z.enum(["internal", "remote"]),
  tool_description: z.string(),
  mcp_server_view_id: z.number(),
  remote_mcp_server_id: z.string().optional(),
  internal_mcp_server_id: z.string().optional(),
  internal_tool_name: z.string().optional(),
  internal_tool_description: z.string().optional(),
});

const SkillDatasourceSchema = z.object({
  tags_in: z.array(z.string()),
  tags_mode: z.string(),
  parents_in: z.array(z.string()),
  tags_not_in: z.array(z.string()),
  datasource_id: z.string(),
  datasource_name: z.string(),
  connector_provider: z.string(),
  data_source_view_id: z.number(),
  datasource_description: z.string(),
});

const SkillDataSchema = z.object({
  name: z.string(),
  description_for_agents: z.string(),
  description_for_humans: z.string(),
  instructions: z.string(),
  icon: z.enum([
    "ActionCommandIcon",
    "ActionRocketIcon",
    "ActionSparklesIcon",
    "ActionBracesIcon",
    "ActionListCheckIcon",
    "ActionSpeakIcon",
    "ActionCubeIcon",
    "ActionLightbulbIcon",
    "ActionBriefcaseIcon",
    "ActionMagicIcon",
    "ActionBrainIcon",
  ]),
  requiredTools: z.array(SkillToolSchema).optional(),
  requiredDatasources: z.array(SkillDatasourceSchema).optional(),
});

const SkillsArraySchema = z.array(SkillDataSchema);

/**
 * Creates suggested skills from a JSON file.
 *
 * Usage:
 * From your local machine:
 * 1. Copy the JSON file to the pod:
 *    kubectl cp <local_path> <pod-name>:/tmp/skills.json -n <namespace>
 *
 * 2. Run the script on the pod from front:
 *    kubectl exec -it <pod-name> -n <namespace> -- npx tsx scripts/create_hard_coded_suggested_skills.ts --file-path /tmp/skills.json --workspaceId <workspaceId> --execute
 *
 * Or locally for testing:
 *    npx tsx scripts/create_hard_coded_suggested_skills.ts --file-path <local_path> --workspaceId <workspaceId> --execute
 */
async function createSuggestedSkills(
  workspace: LightWorkspaceType,
  {
    filePath,
    execute,
    logger: parentLogger,
  }: {
    filePath: string;
    execute: boolean;
    logger: Logger;
  }
): Promise<void> {
  const logger = parentLogger.child({ workspaceId: workspace.sId });

  logger.info({ filePath }, "Starting creation of suggested skills");

  // Resolve the file path
  const resolvedPath = path.resolve(filePath);
  logger.info({ resolvedPath }, "Resolved file path");

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${resolvedPath}`);
  }

  // Read and parse the JSON file with Zod validation
  const fileContent = fs.readFileSync(resolvedPath, "utf-8");
  const parsedJson = JSON.parse(fileContent);

  // Validate with Zod - this will throw if validation fails
  const skills = SkillsArraySchema.parse(parsedJson);

  logger.info(
    { count: skills.length },
    "Parsed and validated skills from file"
  );

  let successCount = 0;
  let errorCount = 0;
  const errors: { skillName: string; error: string }[] = [];

  for (const skill of skills) {
    try {
      // Check if skill requires data sources - not supported yet
      if (skill.requiredDatasources && skill.requiredDatasources.length > 0) {
        throw new Error(
          `Skill "${skill.name}" requires data sources, which are not supported by this script. ` +
            `Data source configuration must be done manually.`
        );
      }

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
        { skillName: skill.name, toolCount: skill.requiredTools?.length ?? 0 },
        execute
          ? "Creating suggested skill"
          : "Would create suggested skill (dry run)"
      );

      // Validate tools and collect MCP server view IDs before transaction
      const mcpServerViewIds: ModelId[] = [];
      if (skill.requiredTools && skill.requiredTools.length > 0) {
        logger.info(
          { skillName: skill.name, toolCount: skill.requiredTools.length },
          "Validating MCP server views and tools"
        );

        for (const tool of skill.requiredTools) {
          const mcpServerViewId = tool.mcp_server_view_id;

          // Verify the MCP server view exists in the database
          const mcpServerView = await MCPServerViewModel.findOne({
            where: {
              id: mcpServerViewId,
              workspaceId: workspace.id,
            },
          });

          if (!mcpServerView) {
            logger.warn(
              {
                skillName: skill.name,
                toolName: tool.tool_name,
                mcpServerViewId,
              },
              "MCP server view not found in workspace"
            );
            continue;
          }

          // Verify tool type matches
          if (mcpServerView.serverType !== tool.tool_type) {
            logger.warn(
              {
                skillName: skill.name,
                toolName: tool.tool_name,
                expectedType: tool.tool_type,
                actualType: mcpServerView.serverType,
              },
              "Tool type mismatch"
            );
            continue;
          }

          // Verify server ID matches based on tool type
          if (tool.tool_type === "internal") {
            if (
              tool.internal_mcp_server_id &&
              mcpServerView.internalMCPServerId !== tool.internal_mcp_server_id
            ) {
              logger.warn(
                {
                  skillName: skill.name,
                  toolName: tool.tool_name,
                  expectedInternalId: tool.internal_mcp_server_id,
                  actualInternalId: mcpServerView.internalMCPServerId,
                },
                "Internal MCP server ID mismatch"
              );
              continue;
            }
          } else if (tool.tool_type === "remote") {
            if (
              tool.remote_mcp_server_id &&
              mcpServerView.remoteMCPServerId?.toString() !==
                tool.remote_mcp_server_id.trim()
            ) {
              logger.warn(
                {
                  skillName: skill.name,
                  toolName: tool.tool_name,
                  expectedRemoteId: tool.remote_mcp_server_id,
                  actualRemoteId: mcpServerView.remoteMCPServerId,
                },
                "Remote MCP server ID mismatch"
              );
              continue;
            }
          }

          // All validations passed
          mcpServerViewIds.push(mcpServerViewId);
        }

        if (mcpServerViewIds.length !== skill.requiredTools.length) {
          logger.warn(
            {
              skillName: skill.name,
              requested: skill.requiredTools.length,
              validated: mcpServerViewIds.length,
            },
            "Some tools could not be validated"
          );
        }
      }

      if (execute) {
        // Use a transaction to ensure all creations succeed or all are rolled back
        await frontSequelize.transaction(async (transaction: Transaction) => {
          // Create the skill configuration
          const createdSkill = await SkillConfigurationModel.create(
            {
              workspaceId: workspace.id,
              name: skill.name,
              agentFacingDescription: skill.description_for_agents,
              userFacingDescription: skill.description_for_humans,
              instructions: skill.instructions,
              status: "suggested",
              editedBy: null,
              requestedSpaceIds: [],
              icon: skill.icon,
              extendedSkillId: null,
            },
            { transaction }
          );

          // Create the skill editors group (without adding any user to it)
          const editorGroup = await GroupResource.makeNew(
            {
              workspaceId: workspace.id,
              name: `${AGENT_GROUP_PREFIX} ${skill.name} (skill:${createdSkill.id})`,
              kind: "agent_editors",
            },
            { transaction }
          );

          // Link the group to the skill
          await GroupSkillModel.create(
            {
              groupId: editorGroup.id,
              skillConfigurationId: createdSkill.id,
              workspaceId: workspace.id,
            },
            { transaction }
          );

          // Link MCP server views (tools) to the skill
          if (mcpServerViewIds.length > 0) {
            await SkillMCPServerConfigurationModel.bulkCreate(
              mcpServerViewIds.map((mcpServerViewId) => ({
                workspaceId: workspace.id,
                skillConfigurationId: createdSkill.id,
                mcpServerViewId,
              })),
              { transaction }
            );
          }

          // TODO: Data source configuration
          // To link data sources to a skill, you would need to:
          // 1. Validate that each data source view exists in the workspace using DataSourceViewResource.fetchByModelPk()
          // 2. Verify that the data source ID, name, and connector provider match
          // 3. Create SkillDataSourceConfigurationModel entries with:
          //    - workspaceId: workspace.id
          //    - skillConfigurationId: createdSkill.id
          //    - dataSourceViewId: the validated data source view ID
          //    - tagsIn: the tags to filter by (optional)
          //    - tagsNotIn: the tags to exclude (optional)
          //    - parentsIn: the parent folders to filter by (optional)
          // 4. Use bulkCreate similar to how MCP server configurations are created above
          //
          // However, this script currently throws an error if requiredDatasources is present
          // to avoid accidentally creating incomplete skill configurations.

          logger.info(
            {
              skillName: skill.name,
              toolsLinked: mcpServerViewIds.length,
              datasourcesLinked: skill.requiredDatasources?.length ?? 0,
            },
            "Successfully created suggested skill with tools and datasources"
          );
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
    workspaceId: {
      alias: "w",
      describe: "Workspace sId where skills should be created",
      type: "string" as const,
    },
    runOnAllWorkspaces: {
      type: "boolean" as const,
      default: false,
    },
  },
  async (
    {
      filePath,
      workspaceId,
      runOnAllWorkspaces: runOnAllWorkspacesOption,
      execute,
    },
    logger
  ) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error("Workspace not found");
      }

      await createSuggestedSkills(renderLightWorkspaceType({ workspace }), {
        logger,
        filePath,
        execute,
      });
    } else if (runOnAllWorkspacesOption) {
      await runOnAllWorkspaces(async (workspace) => {
        await createSuggestedSkills(workspace, {
          logger,
          filePath,
          execute,
        });
      });
    } else {
      logger.info(
        "No op: `runOnAllWorkspaces` not passed and no workspace ID specified."
      );
    }
  }
);
