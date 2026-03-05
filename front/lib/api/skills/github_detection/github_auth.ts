import apiConfig from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";

/**
 * Attempts to retrieve a GitHub access token from an existing MCP connection
 * (workspace only). Returns null if no connection is available.
 */
export async function getGitHubAccessToken(
  auth: Authenticator
): Promise<string | null> {
  const connection = await MCPServerConnectionResource.findByInternalServerName(
    auth,
    {
      serverName: "github",
      connectionType: "workspace",
    }
  );

  if (connection?.connectionId) {
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
  }

  logger.info(
    { workspaceId: auth.getNonNullableWorkspace().sId },
    "No GitHub connection found; falling back to unauthenticated API calls."
  );

  return null;
}
