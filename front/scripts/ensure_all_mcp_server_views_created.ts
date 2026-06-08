import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { getAffectedMCPServerViewsWorkspaceBatchActivity } from "@app/temporal/ensure_mcp_server_views/activities";
import { launchEnsureMCPServerViewsWorkflow } from "@app/temporal/ensure_mcp_server_views/client";
import { DEFAULT_SCAN_BATCH_SIZE } from "@app/temporal/ensure_mcp_server_views/config";

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
    if (workspaceId) {
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with SID ${workspaceId} not found.`);
      }

      const logger = parentLogger.child({
        workspaceId: workspace.sId,
      });

      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      if (execute) {
        const { createdViewsCount } =
          await MCPServerViewResource.ensureAllAutoToolsAreCreated(auth);
        logger.info(
          { createdViewsCount },
          "Successfully ensured MCP server views are created."
        );
      } else {
        logger.info("Would ensure MCP server views are created.");
      }
      return;
    }

    parentLogger.warn(
      "All-workspace direct mode is deprecated. Launching the resumable Temporal workflow instead."
    );

    if (!execute) {
      const scanResult = await getAffectedMCPServerViewsWorkspaceBatchActivity({
        batchSize: DEFAULT_SCAN_BATCH_SIZE,
      });

      parentLogger.info(
        {
          concurrency,
          scannedWorkspacesCount: scanResult.scannedWorkspacesCount,
          affectedWorkspacesCount: scanResult.affectedWorkspaces.length,
          affectedWorkspaceIds: scanResult.affectedWorkspaces.map(
            (workspace) => workspace.workspaceId
          ),
          lastScannedWorkspaceModelId: scanResult.lastScannedWorkspaceModelId,
          hasMore: scanResult.hasMore,
        },
        "Would launch ensure MCP server views Temporal workflow. First scan batch completed."
      );
      return;
    }

    const launchResult = await launchEnsureMCPServerViewsWorkflow({
      concurrency,
    });
    if (launchResult.isErr()) {
      throw launchResult.error;
    }

    parentLogger.info(
      {
        workflowId: launchResult.value.workflowId,
        outcome: launchResult.value.outcome,
        concurrency,
      },
      "Launched ensure MCP server views Temporal workflow."
    );
  }
);
