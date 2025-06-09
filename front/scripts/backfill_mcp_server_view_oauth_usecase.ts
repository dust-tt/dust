import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { MCPServerViewModel } from "@app/lib/models/assistant/actions/mcp_server_view";
import { Workspace } from "@app/lib/models/workspace";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type logger from "@app/logger/logger";

import { makeScript } from "./helpers";

async function worker(
  args: { execute: boolean },
  scriptLogger: typeof logger
): Promise<void> {
  // Find all internal MCP server views that have internalMCPServerId but no oAuthUseCase
  const views = await MCPServerViewModel.findAll({
    where: {
      serverType: "internal",
      internalMCPServerId: { [Op.ne]: null },
      oAuthUseCase: null,
    },
  });

  scriptLogger.info({ count: views.length }, "Found MCP server views to check");

  await concurrentExecutor(
    views,
    async (view) => {
      const workspace = await Workspace.findByPk(view.workspaceId);
      if (!workspace) {
        scriptLogger.info(
          { viewId: view.id },
          "Skipping view as its workspace was not found"
        );
        return;
      }
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
      if (!auth) {
        scriptLogger.info(
          { viewId: view.id },
          "Skipping view as its auth was not found"
        );
        return;
      }

      const resource = await MCPServerViewResource.fetchByModelPk(
        auth,
        view.id
      );

      if (!resource) {
        scriptLogger.info(
          { viewId: view.id },
          "Skipping view as it was not found"
        );
        return;
      }

      try {
        const server = resource.toJSON().server;
        if (server.authorization) {
          scriptLogger.info(
            {
              viewId: view.id,
              useCase: server.authorization.use_case,
            },
            "Updating oAuthUseCase"
          );

          if (args.execute) {
            await view.update({
              oAuthUseCase: server.authorization.use_case,
            });
          }
        }
      } catch (e) {
        scriptLogger.error(
          { viewId: view.id, error: e },
          "Error updating oAuthUseCase"
        );
      }
    },
    { concurrency: 10 }
  );

  if (args.execute) {
    scriptLogger.info("Successfully completed all changes");
  } else {
    scriptLogger.info("Dry run completed, no changes were made");
  }
}

makeScript({}, worker);
