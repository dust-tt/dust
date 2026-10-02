import {
  DEFAULT_MCP_ACTION_VERSION,
  DEFAULT_MCP_SERVER_ICON,
} from "@app/lib/actions/constants";
import type { AuthorizationInfo } from "@app/lib/actions/mcp_metadata_extraction";
import { RemoteMCPServerModel } from "@app/lib/models/agent/actions/remote_mcp_server";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { MCPServerConnectionFactory } from "@app/tests/utils/MCPServerConnectionFactory";
import type { MCPOAuthUseCase } from "@app/types/oauth/lib";

import type { SeedContext } from "./types";

export type SyncAuthWarningSeedAsset = {
  // Matched against `cachedName` for idempotent re-runs.
  name: string;
  description: string;
  url: string;
  oAuthUseCase: MCPOAuthUseCase;
  lastError: string;
  // Defaults to one week ago so the Synchronization banner shows a concrete date.
  lastSyncAt?: Date;
  tools?: { name: string; description: string }[];
};

const DEFAULT_TOOLS = [
  {
    name: "list_records",
    description: "List records from the seeded NetSuite-like server.",
  },
  {
    name: "get_record",
    description: "Fetch a single record by id from the seeded server.",
  },
];

const AUTHORIZATION: AuthorizationInfo = {
  provider: "mcp",
  supported_use_cases: ["platform_actions", "personal_actions"],
};

/**
 * Seeds a fake remote MCP server in the "sync auth expired" state used by the Tools admin UX:
 * OAuth authorization metadata, a workspace connection, an activated use case, and `lastError`.
 *
 * Idempotent: an existing server with the same name is reused and forced back into the warning
 * state (connection + lastError + use case + authorization).
 */
export async function seedRemoteMCPSyncAuthWarning(
  ctx: SeedContext,
  asset: SyncAuthWarningSeedAsset
): Promise<MCPServerViewResource | null> {
  const { auth, execute, logger } = ctx;
  const lastSyncAt =
    asset.lastSyncAt ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const tools = (asset.tools ?? DEFAULT_TOOLS).map((tool) => ({
    ...tool,
    inputSchema: undefined,
  }));

  const existingServers = await RemoteMCPServerResource.listByWorkspace(auth);
  let server = existingServers.find((s) => s.cachedName === asset.name) ?? null;

  if (!server) {
    logger.info(
      { name: asset.name },
      "Creating remote MCP sync-warning tool..."
    );
    if (!execute) {
      return null;
    }

    server = await RemoteMCPServerResource.makeNew(auth, {
      workspaceId: auth.getNonNullableWorkspace().id,
      cachedName: asset.name,
      url: asset.url,
      cachedDescription: asset.description,
      cachedTools: tools,
      icon: DEFAULT_MCP_SERVER_ICON,
      version: DEFAULT_MCP_ACTION_VERSION,
      authorization: AUTHORIZATION,
      oAuthUseCase: asset.oAuthUseCase,
      lastError: asset.lastError,
    });

    await server.markAsErrored(auth, {
      lastError: asset.lastError,
      lastSyncAt,
    });

    logger.info(
      { sId: server.sId, name: asset.name },
      "Remote MCP sync-warning tool created"
    );
  } else {
    logger.info(
      { sId: server.sId, name: asset.name },
      "Remote MCP sync-warning tool already exists, refreshing warning state"
    );

    if (execute) {
      // Authorization is not exposed via updateMetadata; seed scripts write it directly so
      // re-runs restore the OAuth UI even if a prior manual seed left it null.
      await RemoteMCPServerModel.update(
        { authorization: AUTHORIZATION },
        {
          where: {
            id: server.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
        }
      );

      await server.markAsErrored(auth, {
        lastError: asset.lastError,
        lastSyncAt,
      });
    }
  }

  if (!execute) {
    return null;
  }

  const systemView = await MCPServerViewResource.getMCPServerViewForSystemSpace(
    auth,
    server.sId
  );
  if (!systemView) {
    throw new Error(`No system view found for remote MCP server ${server.sId}`);
  }

  if (systemView.oAuthUseCase !== asset.oAuthUseCase) {
    const updateResult = await systemView.updateOAuthUseCase(
      auth,
      asset.oAuthUseCase
    );
    if (updateResult.isErr()) {
      throw updateResult.error;
    }
  }

  let globalView = await MCPServerViewResource.getMCPServerViewForGlobalSpace(
    auth,
    server.sId
  );
  if (!globalView) {
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const { view } = await MCPServerViewResource.create(auth, {
      systemView,
      space: globalSpace,
    });
    globalView = view;
    logger.info(
      { sId: view.sId, name: asset.name },
      "Remote MCP sync-warning tool shared in the global space"
    );
  } else if (globalView.oAuthUseCase !== asset.oAuthUseCase) {
    const updateResult = await globalView.updateOAuthUseCase(
      auth,
      asset.oAuthUseCase
    );
    if (updateResult.isErr()) {
      throw updateResult.error;
    }
  }

  const connectionsResult = await MCPServerConnectionResource.listByMCPServer(
    auth,
    { mcpServerId: server.sId }
  );
  if (connectionsResult.isErr()) {
    throw connectionsResult.error;
  }

  const hasWorkspaceConnection = connectionsResult.value.some(
    (connection) => connection.connectionType === "workspace"
  );
  if (!hasWorkspaceConnection) {
    await MCPServerConnectionFactory.remote(auth, server, "workspace");
    logger.info(
      { sId: server.sId, name: asset.name },
      "Workspace MCP connection created for sync-warning tool"
    );
  }

  return globalView;
}
