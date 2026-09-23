import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerCredentialModel } from "@app/lib/models/agent/actions/internal_mcp_server_credentials";
import { MCPServerConnectionModel } from "@app/lib/models/agent/actions/mcp_server_connection";
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

// The openai_usage internal MCP server has been removed from the codebase. Its numeric id is kept
// in LEGACY_INTERNAL_MCP_SERVER_IDS so historical actions still resolve, but the live wiring must be
// cleaned up: MCP server views, connections, tool metadata, bearer-token credentials, and tool
// approvals. The id is hardcoded here because the server is no longer present in
// INTERNAL_MCP_SERVERS. Same rows as InternalMCPServerInMemoryResource.delete, plus user tool
// approvals, which that path does not clear.
const OPENAI_USAGE_SERVER_ID = 32;

async function deleteOpenAIUsageServerFromWorkspace(
  workspaceId: string,
  { execute }: { execute: boolean },
  logger: Logger
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
  const workspaceModelId = auth.getNonNullableWorkspace().id;

  const openaiUsageServerId = dangerouslyMakeSIdWithCustomFirstPrefix(
    "internal_mcp_server",
    {
      id: OPENAI_USAGE_SERVER_ID,
      workspaceId: workspaceModelId,
      firstPrefix: LEGACY_REGION_BIT,
    }
  );

  const mcpServerViews = await MCPServerViewResource.listByMCPServer(
    auth,
    openaiUsageServerId
  );

  const foundConnectionCount = await MCPServerConnectionModel.count({
    where: {
      workspaceId: workspaceModelId,
      internalMCPServerId: openaiUsageServerId,
    },
  });

  const foundToolMetadataCount = await RemoteMCPServerToolMetadataModel.count({
    where: {
      workspaceId: workspaceModelId,
      internalMCPServerId: openaiUsageServerId,
    },
  });

  const foundCredentialCount = await InternalMCPServerCredentialModel.count({
    where: {
      workspaceId: workspaceModelId,
      internalMCPServerId: openaiUsageServerId,
    },
  });

  const foundUserToolApprovalCount = await UserToolApprovalModel.count({
    where: {
      workspaceId: workspaceModelId,
      mcpServerId: openaiUsageServerId,
    },
  });

  if (
    mcpServerViews.length === 0 &&
    foundConnectionCount === 0 &&
    foundToolMetadataCount === 0 &&
    foundCredentialCount === 0 &&
    foundUserToolApprovalCount === 0
  ) {
    return;
  }

  logger.info(
    {
      workspaceId,
      openaiUsageServerId,
      foundViewCount: mcpServerViews.length,
      foundConnectionCount,
      foundToolMetadataCount,
      foundCredentialCount,
      foundUserToolApprovalCount,
    },
    execute
      ? "Deleting openai_usage MCP server data for workspace"
      : "Dry run: would delete openai_usage MCP server data for workspace"
  );

  if (execute) {
    // hardDelete also clears the agent and skill tool configurations pointing at the view.
    for (const view of mcpServerViews) {
      await view.hardDelete(auth);
    }

    await MCPServerConnectionModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        internalMCPServerId: openaiUsageServerId,
      },
    });

    await RemoteMCPServerToolMetadataModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        internalMCPServerId: openaiUsageServerId,
      },
    });

    await InternalMCPServerCredentialModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        internalMCPServerId: openaiUsageServerId,
      },
    });

    await UserToolApprovalModel.destroy({
      where: {
        workspaceId: workspaceModelId,
        mcpServerId: openaiUsageServerId,
      },
    });
  }
}

makeScript({}, async ({ execute }, logger) => {
  logger.info(
    { openaiUsageServerId: OPENAI_USAGE_SERVER_ID, execute },
    execute
      ? "Deleting openai_usage MCP server data across workspaces"
      : "Dry run: listing openai_usage MCP server data across workspaces"
  );

  await runOnAllWorkspaces(async (workspace) => {
    await deleteOpenAIUsageServerFromWorkspace(
      workspace.sId,
      { execute },
      logger.child({ workspaceId: workspace.sId })
    );
  });

  logger.info("Finished openai_usage MCP server data cleanup");
});
