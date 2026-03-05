import apiConfig from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";

/**
 * Attempts to retrieve a GitHub access token from an existing MCP connection
 * (workspace only). Returns null if no connection is available or if the
 * GitHub server is not on the global space.
 */
export async function getWorkspaceLevelGitHubAccessToken(
  auth: Authenticator
): Promise<string | null> {
  const connection =
    await MCPServerConnectionResource.findByInternalServerName(auth, {
      serverName: "github",
      connectionType: "workspace",
    });

  if (!connection?.connectionId || !connection.internalMCPServerId) {
    return null;
  }

  const globalView = await MCPServerViewResource.getMCPServerViewForGlobalSpace(
    auth,
    connection.internalMCPServerId
  );
  if (!globalView) {
    return null;
  }

  const tokenResult = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    connectionId: connection.connectionId,
  });
  if (tokenResult.isOk()) {
    return tokenResult.value.access_token;
  }

  logger.warn(
    {
      workspaceId: auth.getNonNullableWorkspace().sId,
      error: tokenResult.error,
    },
    "Failed to get GitHub access token from existing connection."
  );

  return null;
}
