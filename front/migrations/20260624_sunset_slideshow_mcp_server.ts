import type { Logger } from "pino";

import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  dangerouslyMakeSIdWithCustomFirstPrefix,
  LEGACY_REGION_BIT,
} from "@app/lib/resources/string_ids";
import { UserToolApprovalModel } from "@app/lib/resources/storage/models/user";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

// The slideshow internal MCP server has been removed from the codebase. Its numeric id is kept in
// LEGACY_INTERNAL_MCP_SERVER_IDS so historical actions still resolve, but the live wiring (MCP
// server views, tool approvals, tool metadata) must be cleaned up. The id is hardcoded here because
// the server is no longer present in INTERNAL_MCP_SERVERS.
const SLIDESHOW_SERVER_ID = 28;

async function deleteSlideshowServerFromWorkspace(
  workspaceId: string,
  { execute }: { execute: boolean },
  logger: Logger
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const slideshowServerId = dangerouslyMakeSIdWithCustomFirstPrefix(
    "internal_mcp_server",
    {
      id: SLIDESHOW_SERVER_ID,
      workspaceId: workspaceModelId,
      firstPrefix: LEGACY_REGION_BIT,
    }
  );

  const mcpServerViews = await MCPServerViewResource.listByMCPServer(
    auth,
    slideshowServerId
  );

  const foundToolMetadataCount = await RemoteMCPServerToolMetadataModel.count({
    where: {
      workspaceId: workspaceModelId,
      internalMCPServerId: slideshowServerId,
    },
  });

  const foundUserToolApprovalCount = await UserToolApprovalModel.count({
    where: {
      workspaceId: workspaceModelId,
      mcpServerId: slideshowServerId,
    },
  });

  if (
    mcpServerViews.length === 0 &&
    foundToolMetadataCount === 0 &&
    foundUserToolApprovalCount === 0
  ) {
    return;
  }

  logger.info(
    {
      workspaceId,
      slideshowServerId,
      foundViewCount: mcpServerViews.length,
      foundToolMetadataCount,
      foundUserToolApprovalCount,
    },
    execute
      ? "Deleting slideshow MCP server data for workspace"
      : "Dry run: would delete slideshow MCP server data for workspace"
  );

  if (execute) {
    for (const view of mcpServerViews) {
      await view.hardDelete(auth);
    }

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        internalMCPServerId: slideshowServerId,
      },
    });

    await UserToolApprovalModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        mcpServerId: slideshowServerId,
      },
    });
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    { slideshowServerId: SLIDESHOW_SERVER_ID, execute },
    execute
      ? "Deleting slideshow MCP server data across workspaces"
      : "Dry run: listing slideshow MCP server data across workspaces"
  );

  await runOnAllWorkspaces(async (workspace) => {
    await deleteSlideshowServerFromWorkspace(
      workspace.sId,
      { execute },
      logger.child({ workspaceId: workspace.sId })
    );
  });

  logger.info("Finished slideshow MCP server data cleanup");
});
