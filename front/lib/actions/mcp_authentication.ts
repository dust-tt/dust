import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type {
  OAuthConnectionType,
  OAuthProvider,
  Result,
  SnowflakeCredentials,
} from "@app/types";
import { Err, getOAuthConnectionAccessToken, OAuthAPI, Ok } from "@app/types";

// Return type for getConnectionForMCPServer that supports both OAuth and key pair auth.
export type MCPServerAuthInfo =
  | {
      authType: "oauth";
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    }
  | {
      authType: "keypair";
      credentials: SnowflakeCredentials;
    };

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
    MCPServerAuthInfo,
    DustError<"mcp_access_token_error" | "connection_not_found">
  >
> {
  const connection = await MCPServerConnectionResource.findByMCPServer(auth, {
    mcpServerId,
    connectionType,
  });
  if (connection.isOk()) {
    const connectionResource = connection.value;

    // Check if this connection uses key pair auth (credentialId) instead of OAuth (connectionId).
    if (connectionResource.credentialId) {
      // Key pair authentication: fetch credentials from Core.
      const oAuthAPI = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
      const credentialsResult = await oAuthAPI.getCredentials({
        credentialsId: connectionResource.credentialId,
      });

      if (credentialsResult.isErr()) {
        logger.warn(
          {
            workspaceId: auth.getNonNullableWorkspace().sId,
            mcpServerId,
            connectionType,
            credentialId: connectionResource.credentialId,
            error: credentialsResult.error,
          },
          "Failed to get credentials for MCP server key pair auth"
        );
        return new Err(
          new DustError(
            "mcp_access_token_error",
            "Failed to get credentials for MCP server"
          )
        );
      }

      // The content should be SnowflakeCredentials for key pair auth.
      const credentials =
        credentialsResult.value.credential.content as SnowflakeCredentials;
      return new Ok({
        authType: "keypair",
        credentials,
      });
    }

    // OAuth authentication: fetch access token.
    const token = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      connectionId: connectionResource.connectionId,
    });
    if (token.isOk()) {
      return new Ok({
        authType: "oauth",
        ...token.value,
      });
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
