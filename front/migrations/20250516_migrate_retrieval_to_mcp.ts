import { format } from "date-fns";
import fs from "fs";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type Logger from "@app/logger/logger";
import { getInsertSQL, makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

async function findWorkspacesWithRetrievalConfigurations(): Promise<ModelId[]> {
  const retrievalConfigurations = await AgentRetrievalConfiguration.findAll({
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

  return retrievalConfigurations.map((config) => config.workspaceId);
}

/**
 * Migrates retrieval actions from non-MCP to MCP version for a specific workspace.
 * If query is "auto", migrates to search MCP action.
 * If query is "none", migrates to include MCP action.
 */
async function migrateWorkspaceRetrievalActions(
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

  logger.info("Starting migration of retrieval actions to MCP.");

  // Find all existing retrieval configurations that are linked to an agent configuration
  // (non-MCP version) and not yet linked to an MCP server configuration.
  const retrievalConfigs = await AgentRetrievalConfiguration.findAll({
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

  if (retrievalConfigs.length === 0) {
    return "";
  }

  logger.info(
    `Found ${retrievalConfigs.length} retrieval configurations to migrate.`
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

  let revertSql = "";

  // For each retrieval configuration, create an MCP server configuration and link it.
  await concurrentExecutor(
    retrievalConfigs,
    async (retrievalConfig) => {
      if (!retrievalConfig.agentConfigurationId) {
        // This should never happen since we fetch where agentConfigurationId is not null.
        logger.info(
          { retrievalConfigurationId: retrievalConfig.id },
          `Already an MCP retrieval config, skipping.`
        );
        return;
      }

      // Determine which MCP server view to use based on the query property
      const mcpServerViewName =
        retrievalConfig.query === "auto" ? "search" : "include_data";
      const mcpServerView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          mcpServerViewName
        );
      if (!mcpServerView) {
        throw new Error(`${mcpServerViewName} MCP server view not found.`);
      }

      if (execute) {
        const mcpConfig = await AgentMCPServerConfiguration.create({
          sId: generateRandomModelSId(),
          agentConfigurationId: retrievalConfig.agentConfigurationId,
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.mcpServerId,
          additionalConfiguration: {},
          timeFrame:
            retrievalConfig.relativeTimeFrameDuration &&
            retrievalConfig.relativeTimeFrameUnit
              ? {
                  duration: retrievalConfig.relativeTimeFrameDuration,
                  unit: retrievalConfig.relativeTimeFrameUnit,
                }
              : null,
          name: retrievalConfig.name,
          singleToolDescriptionOverride: retrievalConfig.description,
          appId: null,
        });

        // Move the datasources to the new MCP server configuration.
        const datasources = await AgentDataSourceConfiguration.findAll({
          where: {
            retrievalConfigurationId: retrievalConfig.id,
          },
        });

        // Before due to foreign key constraint.
        revertSql +=
          getInsertSQL(
            AgentRetrievalConfiguration,
            retrievalConfig.get({ plain: true })
          ) + "\n";

        for (const datasource of datasources) {
          await datasource.update({
            retrievalConfigurationId: null,
            mcpServerConfigurationId: mcpConfig.id,
          });
          revertSql += `UPDATE "agent_data_source_configurations" SET "retrievalConfigurationId" = ${retrievalConfig.id}, "mcpServerConfigurationId" = NULL WHERE "id" = '${datasource.id}';\n`;
        }

        await retrievalConfig.destroy();

        // After due to foreign key constraint.
        revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;

        // Log the model IDs for an easier rollback.
        logger.info(
          {
            retrievalConfigurationId: retrievalConfig.id,
            mcpServerConfigurationId: mcpConfig.id,
            mcpServerViewName,
          },
          `Migrated retrieval config to MCP server config.`
        );
      } else {
        logger.info(
          {
            retrievalConfigurationId: retrievalConfig.id,
            mcpServerViewName,
          },
          `Would create MCP server config and migrate retrieval config to it.`
        );
      }
    },
    { concurrency: 10 }
  );

  if (execute) {
    logger.info(
      `Successfully migrated ${retrievalConfigs.length} retrieval configurations to MCP.`
    );
  } else {
    logger.info(
      `Would have migrated ${retrievalConfigs.length} retrieval configurations to MCP.`
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

    let workspaces: Workspace[] = [];
    if (workspaceId) {
      const workspace = await Workspace.findOne({
        where: {
          sId: workspaceId,
        },
      });
      if (!workspace) {
        throw new Error(`Workspace with SID ${workspaceId} not found.`);
      }
      workspaces = [workspace];
    } else {
      const workspaceIds = await findWorkspacesWithRetrievalConfigurations();
      workspaces = await Workspace.findAll({
        where: {
          id: { [Op.in]: workspaceIds },
        },
        order: [["id", "ASC"]],
      });
    }

    let revertSql = "";
    for (const workspace of workspaces) {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const workspaceRevertSql = await migrateWorkspaceRetrievalActions(auth, {
        execute,
        parentLogger,
      });

      if (execute) {
        fs.writeFileSync(
          `${now}_retrieval_to_mcp_revert_${workspace.sId}.sql`,
          workspaceRevertSql
        );
      }
      revertSql += workspaceRevertSql;
    }

    if (execute) {
      fs.writeFileSync(`${now}_retrieval_to_mcp_revert_all.sql`, revertSql);
    }
  }
);
