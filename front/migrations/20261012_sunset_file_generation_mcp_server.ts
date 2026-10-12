import type { Logger } from "@app/logger/logger";

import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { UserToolApprovalModel } from "@app/lib/resources/storage/models/user";
import {
  dangerouslyMakeSIdWithCustomFirstPrefix,
  LEGACY_REGION_BIT,
} from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

// Hardcoded because file_generation is no longer in INTERNAL_MCP_SERVERS.
const FILE_GENERATION_SERVER_ID = 3;

async function deleteFileGenerationServerFromWorkspace(
  workspaceId: string,
  { execute }: { execute: boolean },
  logger: Logger
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const fileGenerationServerId = dangerouslyMakeSIdWithCustomFirstPrefix(
    "internal_mcp_server",
    {
      id: FILE_GENERATION_SERVER_ID,
      workspaceId: workspaceModelId,
      firstPrefix: LEGACY_REGION_BIT,
    }
  );

  // includeDeleted skips resolving the internal server, which no longer exists.
  const mcpServerViews = await MCPServerViewResource.listByWorkspace(auth, {
    where: {
      serverType: "internal",
      internalMCPServerId: fileGenerationServerId,
    },
    includeDeleted: true,
  });

  const foundToolMetadataCount = await RemoteMCPServerToolMetadataModel.count({
    where: {
      workspaceId: workspaceModelId,
      internalMCPServerId: fileGenerationServerId,
    },
  });

  const foundUserToolApprovalCount = await UserToolApprovalModel.count({
    where: {
      workspaceId: workspaceModelId,
      mcpServerId: fileGenerationServerId,
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
      fileGenerationServerId,
      foundViewCount: mcpServerViews.length,
      foundToolMetadataCount,
      foundUserToolApprovalCount,
    },
    execute
      ? "Deleting file_generation MCP server data for workspace"
      : "Dry run: would delete file_generation MCP server data for workspace"
  );

  if (execute) {
    for (const view of mcpServerViews) {
      await view.hardDelete(auth);
    }

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        internalMCPServerId: fileGenerationServerId,
      },
    });

    await UserToolApprovalModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        mcpServerId: fileGenerationServerId,
      },
    });
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    { fileGenerationServerId: FILE_GENERATION_SERVER_ID, execute },
    execute
      ? "Deleting file_generation MCP server data across workspaces"
      : "Dry run: listing file_generation MCP server data across workspaces"
  );

  await runOnAllWorkspaces(async (workspace) => {
    await deleteFileGenerationServerFromWorkspace(
      workspace.sId,
      { execute },
      logger.child({ workspaceId: workspace.sId })
    );
  });

  logger.info("Finished file_generation MCP server data cleanup");
});
