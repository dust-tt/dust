import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import type { MCPToolResult } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { OAuthConnectionType } from "@app/types";
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
): Promise<string | null> {
  const connection = await getConnectionForInternalMCPServer(auth, {
    mcpServerId,
    connectionType,
  });
  return connection?.access_token ?? null;
}

// Dedicated function to get the connection details for a given provider for internal MCP servers.
// Not using the one from mcp_metadata.ts to avoid circular dependency.
export async function getConnectionForInternalMCPServer(
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
    return token.isOk() ? token.value : null;
  }
  return null;
}

const MCPServerRequiresPersonalAuthenticationErrorName =
  "MCPServerRequiresPersonalAuthenticationError";

export class MCPServerPersonalAuthenticationRequiredError extends Error {
  mcpServerId: string;

  constructor(mcpServerId: string) {
    super(`MCP server ${mcpServerId} requires personal authentication`);
    this.name = MCPServerRequiresPersonalAuthenticationErrorName;
    this.mcpServerId = mcpServerId;
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

export function makeMCPToolPersonalAuthenticationRequiredError(
  mcpServerId: string
): MCPToolResult {
  return {
    isError: true,
    content: [
      {
        type: "resource",
        resource: {
          mimeType:
            INTERNAL_MIME_TYPES.TOOL_ERROR.PERSONAL_AUTHENTICATION_REQUIRED,
          uri: "",
          text: new MCPServerPersonalAuthenticationRequiredError(mcpServerId)
            .message,
          mcpServerId,
        },
      },
    ],
  };
}
