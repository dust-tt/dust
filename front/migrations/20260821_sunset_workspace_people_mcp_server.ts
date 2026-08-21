import { Authenticator } from "@app/lib/auth";
import { RemoteMCPServerToolMetadataModel } from "@app/lib/models/agent/actions/remote_mcp_server_tool_metadata";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  dangerouslyMakeSIdWithCustomFirstPrefix,
  LEGACY_REGION_BIT,
} from "@app/lib/resources/string_ids";
import { UserToolApprovalModel } from "@app/lib/resources/storage/models/user";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

// The workspace_people internal MCP server has been folded into workspace_management, whose
// list_workspace_members tool replaces it. It was an "auto" server, so a view was created in
// every workspace the moment it was hydrated; those views and the tool metadata / approvals that
// reference them have to go. Its numeric id stays in LEGACY_INTERNAL_MCP_SERVER_IDS so historical
// actions still resolve, and is hardcoded here because the server is no longer present in
// INTERNAL_MCP_SERVERS.
const WORKSPACE_PEOPLE_SERVER_ID = 1047;

async function deleteWorkspacePeopleServerFromWorkspace(
  workspaceId: string,
  { execute }: { execute: boolean },
  logger: Logger
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  // Same derivation as autoInternalMCPServerNameToSId, which can no longer be called with a name
  // that has been removed from the registry.
  const workspacePeopleServerId = dangerouslyMakeSIdWithCustomFirstPrefix(
    "internal_mcp_server",
    {
      id: WORKSPACE_PEOPLE_SERVER_ID,
      workspaceId: workspaceModelId,
      firstPrefix: LEGACY_REGION_BIT,
    }
  );

  const mcpServerViews = await MCPServerViewResource.listByMCPServer(
    auth,
    workspacePeopleServerId
  );

  const foundToolMetadataCount = await RemoteMCPServerToolMetadataModel.count({
    where: {
      workspaceId: workspaceModelId,
      internalMCPServerId: workspacePeopleServerId,
    },
  });

  const foundUserToolApprovalCount = await UserToolApprovalModel.count({
    where: {
      workspaceId: workspaceModelId,
      mcpServerId: workspacePeopleServerId,
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
      workspacePeopleServerId,
      foundViewCount: mcpServerViews.length,
      foundToolMetadataCount,
      foundUserToolApprovalCount,
    },
    execute
      ? "Deleting workspace_people MCP server data for workspace"
      : "Dry run: would delete workspace_people MCP server data for workspace"
  );

  if (execute) {
    // hardDelete also clears the agent and skill tool configurations pointing at the view.
    for (const view of mcpServerViews) {
      await view.hardDelete(auth);
    }

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        internalMCPServerId: workspacePeopleServerId,
      },
    });

    await UserToolApprovalModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        mcpServerId: workspacePeopleServerId,
      },
    });
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    { workspacePeopleServerId: WORKSPACE_PEOPLE_SERVER_ID, execute },
    execute
      ? "Deleting workspace_people MCP server data across workspaces"
      : "Dry run: listing workspace_people MCP server data across workspaces"
  );

  await runOnAllWorkspaces(async (workspace) => {
    await deleteWorkspacePeopleServerFromWorkspace(
      workspace.sId,
      { execute },
      logger.child({ workspaceId: workspace.sId })
    );
  });

  logger.info("Finished workspace_people MCP server data cleanup");
});
