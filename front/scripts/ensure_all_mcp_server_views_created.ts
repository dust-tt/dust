import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    workspaceId: {
      type: "string",
      description: "Workspace SID to ensure MCP server views for",
      required: false,
    },
    concurrency: {
      type: "number",
      description: "Number of concurrent workspaces to process",
      required: false,
      default: 50,
    },
  },
  async ({ execute, workspaceId, concurrency }, parentLogger) => {
    let workspaces: WorkspaceResource[] = [];
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with SID ${workspaceId} not found.`);
      }
      workspaces = [workspace];
    } else {
      // Process all workspaces
      workspaces = await WorkspaceResource.listAll("ASC");
    }

    parentLogger.info(
      `Processing ${workspaces.length} workspaces to ensure MCP server views are created.`
    );

    const errors: { workspaceId: string; error: unknown }[] = [];

    await concurrentExecutor(
      workspaces,
      async (workspace) => {
        const logger = parentLogger.child({
          workspaceId: workspace.sId,
        });

        const auth = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );

        if (execute) {
          try {
            const { createdViewsCount } =
              await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
            logger.info(
              { createdViewsCount },
              "Successfully ensured MCP server views are created."
            );
          } catch (e) {
            logger.error(
              { error: e },
              "Error creating MCP server views for workspace."
            );
            errors.push({ workspaceId: workspace.sId, error: e });
          }
        } else {
          logger.info("Would ensure MCP server views are created.");
        }
      },
      { concurrency }
    );

    if (errors.length > 0) {
      parentLogger.error(
        `Migration completed with ${errors.length} errors for the following workspaces: ${errors
          .map((e) => e.workspaceId)
          .join(", ")}`
      );
    } else {
      parentLogger.info("Migration completed successfully.");
    }
  }
);
