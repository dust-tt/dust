import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { getOAuthConnectionAccessToken } from "@app/types";

// Dedicated function to get an access token for a given provider for internal MCP servers.
// Not using the one from mcp_metadata.ts to avoid circular dependency.
export async function getAccessTokenForInternalMCPServer(
  auth: Authenticator,
  {
    mcpServerId,
    connectionType,
  }: {
    mcpServerId: string;
    connectionType: MCPServerConnectionConnectionType;
  }
) {
  const connection = await MCPServerConnectionResource.findByMCPServer({
    auth,
    mcpServerId,
    connectionType,
  });
  if (connection.isOk()) {
    const token = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      connectionId: connection.value.connectionId,
    });
    return token.isOk() ? token.value.access_token : null;
  }
}
