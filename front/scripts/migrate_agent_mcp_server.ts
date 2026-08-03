/**
 * Migrate agent MCP server configurations from one MCP server view to another.
 *
 * Usage:
 *   npx tsx scripts/migrate_agent_mcp_server.ts \
 *     --workspaceId <sId> \
 *     --originMcpServerViewId <sId> \
 *     --destinationMcpServerViewId <sId> \
 *     [--execute]
 *
 * All active agents referencing the origin view are migrated.
 * The destination view must be in a global or regular space (not system).
 */

import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import assert from "assert";
import { format } from "date-fns";
import fs from "fs";

function summarizeMcpServerView(view: MCPServerViewResource) {
  const { server } = view.toJSON();

  return {
    sId: view.sId,
    name: view.name,
    description: view.description,
    spaceId: view.space.sId,
    spaceKind: view.space.kind,
    serverType: view.serverType,
    serverSId: server.sId,
    serverName: server.name,
    internalMCPServerId: view.internalMCPServerId,
    remoteMCPServerId: view.remoteMCPServerId,
    oAuthUseCase: view.oAuthUseCase,
  };
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "The workspace sId to migrate",
    },
    originMcpServerViewId: {
      type: "string",
      demandOption: true,
      description: "sId of the MCP server view to migrate from (e.g. msv_...)",
    },
    destinationMcpServerViewId: {
      type: "string",
      demandOption: true,
      description: "sId of the MCP server view to migrate to (e.g. msv_...)",
    },
  },
  async (
    { workspaceId, originMcpServerViewId, destinationMcpServerViewId, execute },
    logger
  ) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    assert(workspace, `Workspace not found: ${workspaceId}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    const originView = await MCPServerViewResource.fetchById(
      auth,
      originMcpServerViewId
    );
    assert(
      originView,
      `Origin MCP server view not found: ${originMcpServerViewId}`
    );

    const destinationView = await MCPServerViewResource.fetchById(
      auth,
      destinationMcpServerViewId
    );
    assert(
      destinationView,
      `Destination MCP server view not found: ${destinationMcpServerViewId}`
    );
    assert(
      destinationView.space.kind === "global" ||
        destinationView.space.kind === "regular",
      `Destination MCP server view must be in a global or regular space, got: ${destinationView.space.kind}`
    );

    const destinationInternalMCPServerId =
      destinationView.internalMCPServerId ?? null;

    logger.info(
      {
        originView: summarizeMcpServerView(originView),
        destinationView: summarizeMcpServerView(destinationView),
        destinationInternalMCPServerId,
      },
      "Loaded MCP server views."
    );

    const agentConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        mcpServerViewId: originView.id,
      },
      include: [
        {
          model: AgentConfigurationModel,
          attributes: ["id", "sId", "name", "status"],
          where: { status: "active" },
        },
      ],
    });

    if (agentConfigs.length === 0) {
      logger.info(
        "No agent configurations reference the origin MCP server view"
      );
      return;
    }

    logger.info(
      {
        count: agentConfigs.length,
        agents: agentConfigs.map((c) => {
          const agent = c.get("agent_configuration") as
            | AgentConfigurationModel
            | undefined;
          return {
            configId: c.id,
            configSId: c.sId,
            agentSId: agent?.sId ?? "unknown",
            agentName: agent?.name ?? "unknown",
          };
        }),
      },
      execute
        ? "Migrating agent MCP server configurations"
        : "Would migrate agent MCP server configurations (dry run)"
    );

    const now = format(new Date(), "yyyy-MM-dd");
    const revertFile = `${now}_migrate_agent_mcp_server_revert.sql`;
    let revertSql = "";

    try {
      for (const config of agentConfigs) {
        const agent = config.get("agent_configuration") as
          | AgentConfigurationModel
          | undefined;
        logger.info(
          {
            configId: config.id,
            configSId: config.sId,
            agentName: agent?.name ?? "unknown",
            oldMcpServerViewId: config.mcpServerViewId,
            oldInternalMCPServerId: config.internalMCPServerId,
          },
          execute ? "Updating config" : "Would update config"
        );

        if (execute) {
          const internalMCPServerId =
            config.internalMCPServerId !== null
              ? `'${config.internalMCPServerId}'`
              : "NULL";
          revertSql += `UPDATE agent_mcp_server_configurations SET "mcpServerViewId" = ${config.mcpServerViewId}, "internalMCPServerId" = ${internalMCPServerId} WHERE id = ${config.id};\n`;

          await config.update({
            mcpServerViewId: destinationView.id,
            internalMCPServerId: destinationInternalMCPServerId,
          });
        }
      }
    } finally {
      if (execute && revertSql.length > 0) {
        fs.writeFileSync(revertFile, revertSql);
        logger.info({ revertFile }, "Revert SQL written");
      }
    }

    logger.info(
      { migratedCount: agentConfigs.length },
      execute ? "Migration complete" : "Dry run complete"
    );
  }
);
