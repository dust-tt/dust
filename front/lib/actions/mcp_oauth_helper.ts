import type { AuthorizationInfo } from "@app/lib/actions/mcp_actions";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { getOAuthConnectionAccessToken } from "@app/types";

export async function getAccessTokenForMCPServer(
  auth: Authenticator,
  mcpServerId: string,
  authorizationInfo?: AuthorizationInfo
) {
  if (authorizationInfo) {
    const connection = await MCPServerConnectionResource.findByMCPServer({
      auth,
      mcpServerId: mcpServerId,
    });
    if (connection.isOk()) {
      const token = await getOAuthConnectionAccessToken({
        config: apiConfig.getOAuthAPIConfig(),
        logger,
        provider: authorizationInfo.provider,
        connectionId: connection.value.connectionId,
      });
      return token.isOk() ? token.value.access_token : null;
    }
  }
}
