import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import assert from "assert";
import { format } from "date-fns";
import fs from "fs";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "The workspace sId to migrate",
    },
    oldViewId: {
      type: "string",
      demandOption: true,
      description: "sId of the old MCP server view to migrate from",
    },
    newViewId: {
      type: "string",
      demandOption: true,
      description: "sId of the new MCP server view to migrate to",
    },
    agentId: {
      type: "string",
      description:
        "Optional agent sId to scope the migration to a single agent",
    },
  },
  async ({ workspaceId, oldViewId, newViewId, agentId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    assert(workspace, `Workspace not found: ${workspaceId}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    const oldView = await MCPServerViewResource.fetchById(auth, oldViewId);
    assert(oldView, `Old MCP server view not found: ${oldViewId}`);

    const newView = await MCPServerViewResource.fetchById(auth, newViewId);
    assert(newView, `New MCP server view not found: ${newViewId}`);

    assert(oldView.id !== newView.id, "Old and new views must be different");

    assert(
      oldView.space.id === newView.space.id,
      `Old view (space=${oldView.space.sId}) and new view (space=${newView.space.sId}) are not in the same space`
    );

    logger.info(
      {
        oldViewId: oldView.sId,
        oldViewModelId: oldView.id,
        oldServerType: oldView.serverType,
        newViewId: newView.sId,
        newViewModelId: newView.id,
        newServerType: newView.serverType,
        spaceId: oldView.space.sId,
        agentId: agentId ?? null,
      },
      "Resolved old and new MCP server views"
    );

    const agentMCPConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        mcpServerViewId: oldView.id,
      },
      include: [
        {
          model: AgentConfigurationModel,
          attributes: ["id", "sId", "name", "status"],
          where: {
            status: "active",
            ...(agentId ? { sId: agentId } : {}),
          },
          required: true,
        },
      ],
    });

    if (agentMCPConfigs.length === 0) {
      logger.info(
        agentId
          ? `No active configurations for agent ${agentId} reference the old view`
          : "No active agent configurations reference the old view"
      );
      return;
    }

    logger.info(
      {
        count: agentMCPConfigs.length,
        agents: agentMCPConfigs.map((c) => ({
          configId: c.id,
          agentConfigurationId: c.agentConfigurationId,
        })),
      },
      execute
        ? "Migrating agent MCP server configurations"
        : "Would migrate agent MCP server configurations (dry run)"
    );

    const now = format(new Date(), "yyyy-MM-dd");
    const revertFile = `${now}_migrate_mcp_server_view_${oldView.sId}_to_${newView.sId}_revert.sql`;
    let revertSql = "";

    try {
      for (const config of agentMCPConfigs) {
        const agent = config.get("agent_configuration") as
          | AgentConfigurationModel
          | undefined;
        logger.info(
          {
            configId: config.id,
            sId: config.sId,
            agentName: agent?.name ?? "unknown",
            agentSId: agent?.sId ?? "unknown",
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
          const name = config.name !== null ? `'${config.name}'` : "NULL";
          revertSql += `UPDATE agent_mcp_server_configurations SET "mcpServerViewId" = ${config.mcpServerViewId}, "internalMCPServerId" = ${internalMCPServerId}, "name" = ${name} WHERE id = ${config.id};\n`;

          await config.update({
            mcpServerViewId: newView.id,
            internalMCPServerId: newView.internalMCPServerId,
            name: null,
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
      { migratedCount: agentMCPConfigs.length },
      execute ? "Migration complete" : "Dry run complete"
    );
  }
);
