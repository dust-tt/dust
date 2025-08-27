import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { OAuthConnectionType, OAuthProvider } from "@app/types";
import { getOAuthConnectionAccessToken } from "@app/types";

// Dedicated function to get the connection details for an MCP server.
// Not using the one from mcp_metadata.ts to avoid circular dependency.
export async function getConnectionForMCPServer(
  auth: Authenticator,
  {
    mcpServerId,
    connectionType,
  }: {
    mcpServerId: string;
    connectionType: MCPServerConnectionConnectionType;
  }
): Promise<{
  connection: OAuthConnectionType;
  access_token: string;
  access_token_expiry: number | null;
  scrubbed_raw_json: unknown;
} | null> {
  const connection = await MCPServerConnectionResource.findByMCPServer(auth, {
    mcpServerId,
    connectionType,
  });
  if (connection.isOk()) {
    const token = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      connectionId: connection.value.connectionId,
    });
    if (token.isOk()) {
      return token.value;
    } else {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          mcpServerId,
          connectionType,
          error: token.error,
        },
        "Failed to get access token for MCP server"
      );
    }
  } else {
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        mcpServerId,
        connectionType,
        error: connection.error,
      },
      "No connection found for MCP server"
    );
  }
  return null;
}

const MCPServerRequiresPersonalAuthenticationErrorName =
  "MCPServerRequiresPersonalAuthenticationError";

export class MCPServerPersonalAuthenticationRequiredError extends Error {
  mcpServerId: string;
  provider: OAuthProvider;
  scope?: string;

  constructor(mcpServerId: string, provider: OAuthProvider, scope?: string) {
    super(`MCP server ${mcpServerId} requires personal authentication`);
    this.name = MCPServerRequiresPersonalAuthenticationErrorName;
    this.mcpServerId = mcpServerId;
    this.provider = provider;
    this.scope = scope;
  }

  static is(
    error: unknown
  ): error is MCPServerPersonalAuthenticationRequiredError {
    return (
      error instanceof Error &&
      error.name === MCPServerRequiresPersonalAuthenticationErrorName &&
      "mcpServerId" in error
    );
  }
}
