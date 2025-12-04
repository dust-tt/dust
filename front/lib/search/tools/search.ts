import { getConnectionForMCPServer } from "@app/lib/actions/mcp_authentication";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { search as googleDriveSearch } from "@app/lib/actions/mcp_internal_actions/servers/google_drive";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type {
  SearchableTool,
  ToolSearchNode,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";

const SEARCHABLE_MCP_SERVERS = {
  google_drive: { search: googleDriveSearch },
} as const satisfies Partial<Record<InternalMCPServerNameType, SearchableTool>>;
type SearchableMCPServerNameType = keyof typeof SEARCHABLE_MCP_SERVERS;

function _isSearchableMCPServer(
  serverName: InternalMCPServerNameType
): serverName is SearchableMCPServerNameType {
  return serverName in SEARCHABLE_MCP_SERVERS;
}

async function _getToolAccessToken(
  auth: Authenticator,
  serverView: MCPServerViewResource
): Promise<{ tool: SearchableTool; accessToken: string } | null> {
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
    tool: SEARCHABLE_MCP_SERVERS[r.value.name],
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
      const result = await _getToolAccessToken(auth, serverView);
      if (!result) {
        return [];
      }

      try {
        const nodes = await result.tool.search({
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
