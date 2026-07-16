import apiConfig from "@app/lib/api/config";
import { getOAuthConnectionAccessToken } from "@app/lib/api/oauth_access_token";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";

function getSkillImportGitHubConnectionId(
  workspaceMetadata: Record<string, unknown> | null
): string | null {
  const connection = workspaceMetadata?.skillImportGithubConnection;
  if (
    typeof connection === "object" &&
    connection !== null &&
    "connectionId" in connection &&
    isString(connection.connectionId)
  ) {
    return connection.connectionId;
  }
  return null;
}

export async function getWorkspaceLevelGitHubAccessToken(
  auth: Authenticator
): Promise<string | null> {
  const owner = auth.getNonNullableWorkspace();

  let connectionId = getSkillImportGitHubConnectionId(owner.metadata ?? null);

  if (!connectionId) {
    // TODO(2026-08-15): remove this MCP fallback once the workspace GitHub
    // connection UI ships.
    const connection =
      await MCPServerConnectionResource.findByInternalServerName(auth, {
        serverName: "github",
        connectionType: "workspace",
      });
    if (!connection?.connectionId || !connection.internalMCPServerId) {
      return null;
    }

    const globalView =
      await MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        connection.internalMCPServerId
      );
    if (!globalView) {
      return null;
    }

    connectionId = connection.connectionId;
  }

  const tokenResult = await getOAuthConnectionAccessToken({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    connectionId,
  });
  if (tokenResult.isOk()) {
    return tokenResult.value.access_token;
  }

  logger.warn(
    {
      workspaceId: owner.sId,
      error: tokenResult.error,
    },
    "Failed to get GitHub access token from existing connection."
  );

  return null;
}
