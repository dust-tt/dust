import fs from "fs";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/agent/actions/data_sources";
import { AgentMCPServerConfiguration } from "@app/lib/models/agent/actions/mcp";

import { AgentConfiguration } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getInsertSQL } from "@app/lib/utils/sql_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

const DEFAULT_PROCESS_ACTION_NAME = "extract_structured_data_from_data_sources";

async function findWorkspacesWithProcessConfigurations(): Promise<ModelId[]> {
  // @ts-ignore
  const processConfigurations = await AgentProcessConfiguration.findAll({
    attributes: ["workspaceId"],
    // Filter on active agents.
    include: [
      {
        attributes: [],
        model: AgentConfiguration,
        required: true,
        where: {
          status: "active",
        },
      },
    ],
    order: [["id", "ASC"]],
  });

  // @ts-ignore
  return processConfigurations.map((config) => config.workspaceId);
}

/**
 * Migrates extract actions (process configurations) from non-MCP to MCP version for a specific workspace.
 * The process configurations are migrated to the extract_data MCP action.
 */
async function migrateWorkspaceExtractActions(
  auth: Authenticator,
  {
    execute,
    parentLogger,
  }: {
    execute: boolean;
    parentLogger: typeof Logger;
  }
): Promise<string> {
  const logger = parentLogger.child({
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  logger.info(
    "Starting migration of extract actions (process configurations) to MCP."
  );

  // Find all existing process configurations that are linked to an agent configuration
  // (non-MCP version) and not yet linked to an MCP server configuration.
  // @ts-ignore
  const processConfigs = await AgentProcessConfiguration.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    // Filter on active agents.
    include: [
      {
        attributes: [],
        model: AgentConfiguration,
        required: true,
        where: {
          status: "active",
        },
      },
    ],
    order: [["id", "ASC"]],
  });

  if (processConfigs.length === 0) {
    return "";
  }

  logger.info(
    `Found ${processConfigs.length} process configurations to migrate.`
  );

  if (execute) {
    // Create the MCP server views in system and global spaces.
    try {
      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
    } catch (e) {
      logger.error(
        { error: e },
        "Error creating MCP server views, skipping migration."
      );
      return "";
    }
  }

  // Get the extract_data MCP server view
  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      "extract_data"
    );
  if (!mcpServerView) {
    throw new Error("extract_data MCP server view not found.");
  }

  let revertSql = "";

  // For each process configuration, create an MCP server configuration and link it.
  await concurrentExecutor(
    processConfigs,
    async (processConfig) => {
      if (execute) {
        const mcpConfig = await AgentMCPServerConfiguration.create({
          sId: generateRandomModelSId(),
          // @ts-ignore
          agentConfigurationId: processConfig.agentConfigurationId,
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.mcpServerId,
          additionalConfiguration: {},
          timeFrame:
            // @ts-ignore
            processConfig.relativeTimeFrameDuration &&
            // @ts-ignore
            processConfig.relativeTimeFrameUnit
              ? {
                  // @ts-ignore
                  duration: processConfig.relativeTimeFrameDuration,
                  // @ts-ignore
                  unit: processConfig.relativeTimeFrameUnit,
                }
              : null,
          name:
            // @ts-ignore
            !processConfig.name ||
            // @ts-ignore
            processConfig.name === DEFAULT_PROCESS_ACTION_NAME
              ? null
              : // @ts-ignore
                processConfig.name,
          // @ts-ignore
          singleToolDescriptionOverride: processConfig.description,
          appId: null,
          // @ts-ignore
          jsonSchema: processConfig.jsonSchema,
        });

        // Move the datasources to the new MCP server configuration.
        const datasources = await AgentDataSourceConfiguration.findAll({
          where: {
            workspaceId: auth.getNonNullableWorkspace().id,
            // @ts-ignore
            processConfigurationId: processConfig.id,
          },
        });

        // Before due to foreign key constraint.
        revertSql +=
          getInsertSQL(
            // @ts-ignore
            AgentProcessConfiguration,
            // @ts-ignore
            processConfig.get({ plain: true })
          ) + "\n";

        for (const datasource of datasources) {
          await datasource.update({
            // @ts-ignore
            processConfigurationId: null,
            mcpServerConfigurationId: mcpConfig.id,
          });
          // @ts-ignore
          revertSql += `UPDATE "agent_data_source_configurations" SET "processConfigurationId" = ${processConfig.id}, "mcpServerConfigurationId" = NULL WHERE "id" = '${datasource.id}';\n`;
        }

        // @ts-ignore
        await processConfig.destroy();

        // After due to foreign key constraint.
        revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;

        // Log the model IDs for an easier rollback.
        logger.info(
          {
            // @ts-ignore
            processConfigurationId: processConfig.id,
            mcpServerConfigurationId: mcpConfig.id,
          },
          `Migrated process config to MCP server config (extract_data).`
        );
      } else {
        logger.info(
          {
            // @ts-ignore
            processConfigurationId: processConfig.id,
          },
          `Would create MCP server config and migrate process config to it.`
        );
      }
    },
    { concurrency: 10 }
  );

  if (execute) {
    logger.info(
      `Successfully migrated ${processConfigs.length} process configurations to MCP.`
    );
  } else {
    logger.info(
      `Would have migrated ${processConfigs.length} process configurations to MCP.`
    );
  }

  return revertSql;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace SID to migrate",
      required: false,
    },
  },
  async ({ execute, workspaceId }, parentLogger) => {
    const now = new Date().toISOString().slice(0, 16).replace(/-/g, "");

    let workspaces: WorkspaceModel[] = [];
    if (workspaceId) {
      const workspace = await WorkspaceModel.findOne({
        where: {
          sId: workspaceId,
        },
      });
      if (!workspace) {
        throw new Error(`Workspace with SID ${workspaceId} not found.`);
      }
      workspaces = [workspace];
    } else {
      const workspaceIds = await findWorkspacesWithProcessConfigurations();
      workspaces = await WorkspaceModel.findAll({
        where: {
          id: { [Op.in]: workspaceIds },
        },
        order: [["id", "ASC"]],
      });
    }

    let revertSql = "";
    for (const workspace of workspaces) {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);

      const workspaceRevertSql = await migrateWorkspaceExtractActions(auth, {
        execute,
        parentLogger,
      });

      if (execute) {
        fs.writeFileSync(
          `${now}_extract_to_mcp_revert_${workspace.sId}.sql`,
          workspaceRevertSql
        );
      }
      revertSql += workspaceRevertSql;
    }

    if (execute) {
      fs.writeFileSync(`${now}_extract_to_mcp_revert_all.sql`, revertSql);
    }
  }
);
