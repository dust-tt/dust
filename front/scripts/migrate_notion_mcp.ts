import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { MCPServerViewModel } from "@app/lib/models/agent/actions/mcp_server_view";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import assert from "assert";
import { format } from "date-fns";
import fs from "fs";

const NOTION_REMOTE_MCP_URL = "https://mcp.notion.com/mcp";

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "The workspace sId to migrate",
    },
    oldViewId: {
      type: "number",
      required: false,
      description:
        "Model ID of the old (internal) Notion MCP server view, if disambiguation is needed",
    },
    newViewId: {
      type: "number",
      required: false,
      description:
        "Model ID of the new (remote) Notion MCP server view, if disambiguation is needed",
    },
  },
  async ({ workspaceId, oldViewId, newViewId, execute }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    assert(workspace, `Workspace not found: ${workspaceId}`);

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const workspaceModelId = auth.getNonNullableWorkspace().id;

    // Exclude the system space — internal servers have auto-created views there.
    const systemSpace = await SpaceModel.findOne({
      where: { workspaceId: workspaceModelId, kind: "system" },
    });
    assert(systemSpace, "System space not found");
    const systemSpaceId = systemSpace.id;

    // Find old (internal) Notion MCP server views (excluding system space).
    const allOldViews = await MCPServerViewModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        serverType: "internal",
        deletedAt: null,
      },
    });
    const oldViews = allOldViews.filter(
      (v) =>
        v.vaultId !== systemSpaceId &&
        matchesInternalMCPServerName(v.internalMCPServerId, "notion")
    );

    // Find new (remote) Notion MCP server views by joining with
    // RemoteMCPServerModel and matching on URL (excluding system space).
    const newViews = await MCPServerViewModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        serverType: "remote",
        deletedAt: null,
      },
      include: [
        {
          model: RemoteMCPServerModel,
          as: "remoteMCPServer",
          where: { url: NOTION_REMOTE_MCP_URL },
          required: true,
        },
      ],
    });
    const filteredNewViews = newViews.filter(
      (v) => v.vaultId !== systemSpaceId
    );

    logger.info(
      {
        oldViewCount: oldViews.length,
        newViewCount: filteredNewViews.length,
        oldViewIds: oldViews.map((v) => v.id),
        newViewIds: filteredNewViews.map((v) => v.id),
      },
      "Found Notion MCP server views (excluding system space)"
    );

    // Resolve old view.
    let oldView: MCPServerViewModel;
    if (oldViewId) {
      const match = oldViews.find((v) => v.id === oldViewId);
      assert(
        match,
        `Old view ID ${oldViewId} not found among internal Notion views: [${oldViews.map((v) => v.id).join(", ")}]`
      );
      oldView = match;
    } else {
      assert(
        oldViews.length === 1,
        `Expected exactly 1 old (internal) Notion view, found ${oldViews.length}. ` +
          `Use --oldViewId to disambiguate among: [${oldViews.map((v) => v.id).join(", ")}]`
      );
      oldView = oldViews[0];
    }

    // Resolve new view.
    let newView: MCPServerViewModel;
    if (newViewId) {
      const match = filteredNewViews.find((v) => v.id === newViewId);
      assert(
        match,
        `New view ID ${newViewId} not found among remote Notion views: [${filteredNewViews.map((v) => v.id).join(", ")}]`
      );
      newView = match;
    } else {
      assert(
        filteredNewViews.length === 1,
        `Expected exactly 1 new (remote) Notion view, found ${filteredNewViews.length}. ` +
          `Use --newViewId to disambiguate among: [${filteredNewViews.map((v) => v.id).join(", ")}]`
      );
      newView = filteredNewViews[0];
    }

    // Verify both views are in the same space.
    assert(
      oldView.vaultId === newView.vaultId,
      `Old view (vaultId=${oldView.vaultId}) and new view (vaultId=${newView.vaultId}) are not in the same space`
    );

    logger.info(
      {
        oldViewId: oldView.id,
        oldInternalMCPServerId: oldView.internalMCPServerId,
        newViewId: newView.id,
        newRemoteMCPServerId: newView.remoteMCPServerId,
        vaultId: oldView.vaultId,
      },
      "Resolved old and new Notion MCP server views"
    );

    // Find active agent MCP server configurations pointing to the old view.
    const agentMCPConfigs = await AgentMCPServerConfigurationModel.findAll({
      where: {
        workspaceId: workspaceModelId,
        mcpServerViewId: oldView.id,
      },
      include: [
        {
          model: AgentConfigurationModel,
          attributes: ["id", "sId", "name", "status"],
          where: { status: "active" },
        },
      ],
    });

    if (agentMCPConfigs.length === 0) {
      logger.info("No agent configurations reference the old Notion view");
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
    const revertFile = `${now}_migrate_notion_mcp_revert.sql`;
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
            internalMCPServerId: null,
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
