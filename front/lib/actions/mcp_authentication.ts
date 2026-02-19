import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import { getOAuthConnectionAccessToken } from "@app/types/oauth/client/access_token";
import type { OAuthConnectionType, OAuthProvider } from "@app/types/oauth/lib";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
): Promise<
  Result<
    {
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    },
    DustError<"mcp_access_token_error" | "connection_not_found">
  >
> {
  const connection = await MCPServerConnectionResource.findByMCPServer(auth, {
    mcpServerId,
    connectionType,
  });
  if (connection.isOk()) {
    if (!connection.value.connectionId) {
      logger.info(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          mcpServerId,
          connectionType,
          connectionId: connection.value.connectionId,
          credentialId: connection.value.credentialId,
        },
        "MCP server connection is not configured for OAuth"
      );
      return new Err(
        new DustError("connection_not_found", "Connection not found")
      );
    }
    const token = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      connectionId: connection.value.connectionId,
    });
    if (token.isOk()) {
      return new Ok(token.value);
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
      return new Err(
        new DustError(
          "mcp_access_token_error",
          "Failed to get access token for MCP server"
        )
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
    return new Err(
      new DustError(
        "connection_not_found",
        "No connection found for MCP server"
      )
    );
  }
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

const MCPServerRequiresAdminAuthenticationErrorName =
  "MCPServerRequiresAdminAuthenticationError";

export class MCPServerRequiresAdminAuthenticationError extends Error {
  mcpServerId: string;
  provider: OAuthProvider;
  scope?: string;

  constructor(mcpServerId: string, provider: OAuthProvider, scope?: string) {
    super(
      `MCP server ${mcpServerId} requires your admin(s) to setup the connection for your workspace on Dust.`
    );
    this.name = MCPServerRequiresAdminAuthenticationErrorName;
    this.mcpServerId = mcpServerId;
    this.provider = provider;
    this.scope = scope;
  }

  static is(
    error: unknown
  ): error is MCPServerRequiresAdminAuthenticationError {
    return (
      error instanceof Error &&
      error.name === MCPServerRequiresAdminAuthenticationErrorName &&
      "mcpServerId" in error
    );
  }
}
