import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace SID to ensure MCP server views for",
      required: false,
    },
  },
  async ({ execute, workspaceId }, parentLogger) => {
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
      // Process all workspaces
      workspaces = await Workspace.findAll({
        order: [["id", "ASC"]],
      });
    }

    parentLogger.info(
      `Processing ${workspaces.length} workspaces to ensure MCP server views are created.`
    );

    for (const workspace of workspaces) {
      const logger = parentLogger.child({
        workspaceId: workspace.sId,
      });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      if (execute) {
        try {
          await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
          logger.info("Successfully ensured MCP server views are created.");
        } catch (e) {
          logger.error(
            { error: e },
            "Error creating MCP server views for workspace."
          );
        }
      } else {
        logger.info("Would ensure MCP server views are created.");
      }
    }

    parentLogger.info("Migration completed.");
  }
);
