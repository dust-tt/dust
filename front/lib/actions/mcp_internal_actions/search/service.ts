import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { googleDriveProvider } from "@app/lib/actions/mcp_internal_actions/search/search_google_drive";
import type {
  SearchableProvider,
  ToolAttachment,
  ToolSearchNode,
} from "@app/lib/actions/mcp_internal_actions/search/types";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";

const SEARCHABLE_MCP_SERVERS = {
  google_drive: googleDriveProvider,
} as const satisfies Partial<
  Record<InternalMCPServerNameType, SearchableProvider>
>;
type SearchableMCPServerNameType = keyof typeof SEARCHABLE_MCP_SERVERS;

function _isSearchableMCPServer(
  serverName: InternalMCPServerNameType
): serverName is SearchableMCPServerNameType {
  return serverName in SEARCHABLE_MCP_SERVERS;
}

async function _getProviderAndAccessToken(
  auth: Authenticator,
  serverView: MCPServerViewResource
): Promise<{ provider: SearchableProvider; accessToken: string } | null> {
  const r = getInternalMCPServerNameAndWorkspaceId(serverView.mcpServerId);
  if (r.isErr() || !_isSearchableMCPServer(r.value.name)) {
    return null;
  }

  const connectionType: MCPServerConnectionConnectionType =
    serverView.oAuthUseCase === "platform_actions" ? "workspace" : "personal";

  const connectionResult = await getConnectionForMCPServer(auth, {
    mcpServerId: serverView.mcpServerId,
    connectionType,
  });

  if (!connectionResult) {
    return null;
  }

  return {
    provider: SEARCHABLE_MCP_SERVERS[r.value.name],
    accessToken: connectionResult.access_token,
  };
}

export async function searchToolNodes({
  auth,
  query,
  pageSize,
}: {
  auth: Authenticator;
  query: string;
  pageSize: number;
}): Promise<ToolSearchNode[]> {
  const spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const serverViews = await MCPServerViewResource.listBySpaces(auth, spaces);

  const searchableServerViews = serverViews.filter((view) => {
    const r = getInternalMCPServerNameAndWorkspaceId(view.mcpServerId);
    return r.isOk() && _isSearchableMCPServer(r.value.name);
  });

  if (searchableServerViews.length === 0) {
    return [];
  }

  const results = await Promise.all(
    searchableServerViews.map(async (serverView) => {
      const result = await _getProviderAndAccessToken(auth, serverView);
      if (!result) {
        return [];
      }

      try {
        const nodes = await result.provider.search({
          accessToken: result.accessToken,
          query,
          pageSize,
        });
        const serverJson = serverView.toJSON();
        return nodes.map((node) => ({
          ...node,
          serverViewId: serverView.sId,
          serverName: serverJson.server.name,
          serverIcon: serverJson.server.icon,
        }));
      } catch (error) {
        const r = getInternalMCPServerNameAndWorkspaceId(
          serverView.mcpServerId
        );
        logger.error(
          {
            error,
            serverName: r.isOk() ? r.value.name : "unknown",
            workspaceId: auth.getNonNullableWorkspace().sId,
          },
          "Error searching for attachments"
        );
        return [];
      }
    })
  );

  return results.flat();
}

export async function getFileToAttach({
  auth,
  serverViewId,
  fileId,
}: {
  auth: Authenticator;
  serverViewId: string;
  fileId: string;
}): Promise<ToolAttachment> {
  const serverView = await MCPServerViewResource.fetchById(auth, serverViewId);
  if (!serverView) {
    throw new Error("Server view not found.");
  }

  const result = await _getProviderAndAccessToken(auth, serverView);
  if (!result) {
    throw new Error("Could not authenticate to retrieve the file to attach.");
  }

  return result.provider.getFile({
    accessToken: result.accessToken,
    fileId,
  });
}
