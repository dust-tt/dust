import fs from "fs";
import path from "path";
import { Op } from "sequelize";

import { ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME } from "@app/components/assistant_builder/types";
import { Authenticator } from "@app/lib/auth";
import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
import { AgentMCPServerConfiguration } from "@app/lib/models/assistant/actions/mcp";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getInsertSQL } from "@app/lib/utils/sql_utils";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { ModelId } from "@app/types";

async function findWorkspacesWithDustAppRunConfigurations(): Promise<
  ModelId[]
> {
  const dustAppRunConfigurations = await AgentDustAppRunConfiguration.findAll({
    attributes: ["workspaceId"],
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

  return dustAppRunConfigurations.map((config) => config.workspaceId);
}

async function migrateWorkspaceDustAppRunActions(
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

  logger.info("Starting migration of dust app run actions to MCP.");

  const dustAppConfigs = await AgentDustAppRunConfiguration.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
    },
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

  if (dustAppConfigs.length === 0) {
    return "";
  }

  logger.info(
    `Found ${dustAppConfigs.length} dust app run configurations to migrate.`
  );

  const appIds = new Set(dustAppConfigs.map((config) => config.appId));

  const apps = await AppModel.findAll({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: { [Op.in]: [...appIds] },
    },
  });

  const appsName = apps.reduce(
    (acc, app) => {
      acc[app.sId] = app.name;
      return acc;
    },
    {} as Record<string, string>
  );

  if (execute) {
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

  const mcpServerView =
    await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
      auth,
      ASSISTANT_BUILDER_DUST_APP_RUN_ACTION_CONFIGURATION_DEFAULT_NAME
    );
  if (!mcpServerView) {
    throw new Error("Run Dust App MCP server view not found.");
  }

  let revertSql = "";

  await concurrentExecutor(
    dustAppConfigs,
    async (dustAppConfig) => {
      if (!dustAppConfig.agentConfigurationId) {
        logger.info(
          { dustAppConfigurationId: dustAppConfig.id },
          `Already an MCP dust app config, skipping.`
        );
        return;
      }

      if (execute) {
        const mcpConfig = await AgentMCPServerConfiguration.create({
          sId: generateRandomModelSId(),
          agentConfigurationId: dustAppConfig.agentConfigurationId,
          workspaceId: auth.getNonNullableWorkspace().id,
          mcpServerViewId: mcpServerView.id,
          internalMCPServerId: mcpServerView.mcpServerId,
          additionalConfiguration: {},
          timeFrame: null,
          name: appsName[dustAppConfig.appId],
          appId: dustAppConfig.appId,
          singleToolDescriptionOverride: null,
          jsonSchema: null,
        });

        revertSql +=
          getInsertSQL(
            AgentDustAppRunConfiguration,
            dustAppConfig.get({ plain: true })
          ) + "\n";
        revertSql += `UPDATE "agent_dust_app_run_configurations" SET "agentConfigurationId" = '${dustAppConfig.agentConfigurationId}', "mcpServerConfigurationId" = NULL WHERE "id" = '${dustAppConfig.id}';\n`;
        revertSql += `DELETE FROM "agent_mcp_server_configurations" WHERE "id" = '${mcpConfig.id}';\n`;

        await dustAppConfig.destroy();

        logger.info(
          {
            dustAppConfigurationId: dustAppConfig.id,
            mcpServerConfigurationId: mcpConfig.id,
          },
          `Migrated dust app config to MCP server config.`
        );
      } else {
        logger.info(
          {
            dustAppConfigurationId: dustAppConfig.id,
          },
          `Would create MCP server config and migrate dust app config to it.`
        );
      }
    },
    { concurrency: 10 }
  );

  if (execute) {
    logger.info(
      `Successfully migrated ${dustAppConfigs.length} dust app configurations to MCP.`
    );
  } else {
    logger.info(
      `Would have migrated ${dustAppConfigs.length} dust app configurations to MCP.`
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
      const workspaceIds = await findWorkspacesWithDustAppRunConfigurations();
      workspaces = await Workspace.findAll({
        where: {
          id: { [Op.in]: workspaceIds },
        },
        order: [["id", "ASC"]],
      });
    }

    const migrationDir = "migration_dust_app_run";
    if (execute) {
      fs.mkdirSync(migrationDir, { recursive: true });
    }

    let revertSql = "";
    for (const workspace of workspaces) {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      const workspaceRevertSql = await migrateWorkspaceDustAppRunActions(auth, {
        execute,
        parentLogger,
      });

      if (execute) {
        fs.writeFileSync(
          path.join(
            migrationDir,
            `${now}_dust_app_run_to_mcp_revert_${workspace.sId}.sql`
          ),
          workspaceRevertSql
        );
      }
      revertSql += workspaceRevertSql;
    }

    if (execute) {
      fs.writeFileSync(
        path.join(migrationDir, `${now}_dust_app_run_to_mcp_revert_all.sql`),
        revertSql
      );
    }
  }
);
