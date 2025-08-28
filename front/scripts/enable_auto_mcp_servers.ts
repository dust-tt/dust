import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

const ensureAllAutoToolsAreCreated = async (
  workspace: LightWorkspaceType | WorkspaceResource,
  execute: boolean,
  logger: Logger
) => {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  if (execute) {
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
  } else {
    logger.info(
      { workspaceId: workspace.sId },
      "Would ensure all auto tools are created for workspace"
    );
  }
};

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "A single workspace id.",
    },
  },
  async ({ workspaceId, execute }, logger) => {
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (workspace) {
        await ensureAllAutoToolsAreCreated(workspace, execute, logger);
      }
    }

    return runOnAllWorkspaces(async (workspace) =>
      ensureAllAutoToolsAreCreated(workspace, execute, logger)
    );
  }
);
