import * as fs from "fs";
import * as path from "path";
import type { Transaction } from "sequelize";

import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import {
  SkillConfigurationModel,
  SkillDataSourceConfigurationModel,
  SkillMCPServerConfigurationModel,
} from "@app/lib/models/skill";
import { GroupSkillModel } from "@app/lib/models/skill/group_skill";
import { GroupResource } from "@app/lib/resources/group_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";
import { AGENT_GROUP_PREFIX } from "@app/types";

interface SkillData {
  name: string;
  description_for_agents: string;
  description_for_humans: string;
  instructions: string;
  requiredTools?: Array<{
    tool_name: string;
    tool_type: "internal" | "remote";
    tool_description: string;
    mcp_server_view_id: number;
    remote_mcp_server_id?: string;
    internal_mcp_server_id?: string;
    internal_tool_name?: string;
    internal_tool_description?: string;
  }>;
  requiredDatasources?: Array<{
    tags_in: string[];
    tags_mode: string;
    parents_in: string[];
    tags_not_in: string[];
    datasource_id: string;
    datasource_name: string;
    connector_provider: string;
    data_source_view_id: number;
    datasource_description: string;
  }>;
}

/**
 * Creates suggested skills from a JSON file.
 *
 * Usage:
 * From your local machine:
 * 1. Copy the JSON file to the pod:
 *    kubectl cp <local_path> <pod-name>:/tmp/skills.json -n <namespace>
 *
 * 2. Run the script on the pod from front:
 *    kubectl exec -it <pod-name> -n <namespace> -- npx tsx scripts/create_hard_coded_suggested_skills.ts --file-path /tmp/skills.json --workspaceSId <workspaceSId> --execute
 *
 * Or locally for testing:
 *    npx tsx scripts/create_hard_coded_suggested_skills.ts --file-path <local_path> --workspaceSId <workspaceSId> --execute
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
        { skillName: skill.name, toolCount: skill.requiredTools?.length ?? 0 },
        execute
          ? "Creating suggested skill"
          : "Would create suggested skill (dry run)"
      );

      if (execute) {
        // Use a transaction to ensure all creations succeed or all are rolled back
        await frontSequelize.transaction(async (transaction: Transaction) => {
          // Validate tools and collect MCP server view IDs
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
                transaction,
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
                  mcpServerView.internalMCPServerId !==
                    tool.internal_mcp_server_id
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

          // Create the skill configuration
          const createdSkill = await SkillConfigurationModel.create(
            {
              workspaceId: workspace.id,
              name: skill.name,
              agentFacingDescription: skill.description_for_agents,
              userFacingDescription: skill.description_for_humans,
              instructions: skill.instructions,
              status: "suggested",
              authorId: null,
              requestedSpaceIds: [],
              icon: null,
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

          // Create data source configurations
          if (skill.requiredDatasources && skill.requiredDatasources.length > 0) {
            // Fetch data source views to get the correct dataSourceId
            const dataSourceViewIds = skill.requiredDatasources.map(
              (ds) => ds.data_source_view_id
            );
            const dataSourceViews = await DataSourceViewModel.findAll({
              where: {
                id: dataSourceViewIds,
                workspaceId: workspace.id,
              },
              transaction,
            });

            const dataSourceViewMap = new Map(
              dataSourceViews.map((dsv) => [dsv.id, dsv])
            );

            // Group by data source view ID and merge parentsIn arrays
            // This matches the behavior of computeDataSourceConfigurationChanges
            const configsByViewId = new Map<
              ModelId,
              {
                workspaceId: ModelId;
                skillConfigurationId: ModelId;
                dataSourceId: ModelId;
                dataSourceViewId: ModelId;
                parentsIn: string[];
              }
            >();

            for (const ds of skill.requiredDatasources) {
              const dataSourceView = dataSourceViewMap.get(
                ds.data_source_view_id
              );
              if (!dataSourceView) {
                logger.warn(
                  {
                    skillName: skill.name,
                    dataSourceViewId: ds.data_source_view_id,
                  },
                  "Data source view not found in workspace"
                );
                continue;
              }

              const existing = configsByViewId.get(dataSourceView.id);
              if (existing) {
                // Merge parentsIn arrays, removing duplicates
                existing.parentsIn = Array.from(
                  new Set([...existing.parentsIn, ...ds.parents_in])
                );
              } else {
                // Create new configuration entry
                configsByViewId.set(dataSourceView.id, {
                  workspaceId: workspace.id,
                  skillConfigurationId: createdSkill.id,
                  dataSourceId: dataSourceView.dataSourceId,
                  dataSourceViewId: dataSourceView.id,
                  parentsIn: ds.parents_in,
                });
              }
            }

            const dataSourceConfigs = Array.from(configsByViewId.values());

            if (dataSourceConfigs.length > 0) {
              await SkillDataSourceConfigurationModel.bulkCreate(
                dataSourceConfigs,
                { transaction }
              );
            }
          }

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
