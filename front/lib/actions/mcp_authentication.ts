import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { OAuthConnectionType, OAuthProvider, Result } from "@app/types";
import { Err, getOAuthConnectionAccessToken, OAuthAPI, Ok } from "@app/types";

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
      return new Err(
        new DustError(
          "connection_not_found",
          "No OAuth connection found for MCP server"
        )
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

export type MCPServerResolvedAuth =
  | {
      authType: "oauth";
      connection: OAuthConnectionType;
      access_token: string;
      access_token_expiry: number | null;
      scrubbed_raw_json: unknown;
    }
  | {
      authType: "keypair";
      credentials: SnowflakeKeypairCredentials;
    };

type SnowflakeKeypairCredentials = {
  account: string;
  username: string;
  role: string;
  warehouse: string;
  private_key: string;
  private_key_passphrase?: string;
};

function isSnowflakeKeypairCredential(
  value: unknown
): value is SnowflakeKeypairCredentials {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.account === "string" &&
    typeof v.username === "string" &&
    typeof v.role === "string" &&
    typeof v.warehouse === "string" &&
    typeof v.private_key === "string" &&
    (v.private_key_passphrase === undefined ||
      typeof v.private_key_passphrase === "string")
  );
}

export async function getResolvedAuthForMCPServer(
  auth: Authenticator,
  {
    mcpServerId,
    connectionType,
  }: {
    mcpServerId: string;
    connectionType: MCPServerConnectionConnectionType;
  }
): Promise<
  Result<MCPServerResolvedAuth, DustError<"mcp_access_token_error" | "connection_not_found">>
> {
  const connection = await MCPServerConnectionResource.findByMCPServer(auth, {
    mcpServerId,
    connectionType,
  });

  if (connection.isErr()) {
    return new Err(
      new DustError("connection_not_found", "No connection found for MCP server")
    );
  }

  if (connection.value.connectionId) {
    const token = await getOAuthConnectionAccessToken({
      config: apiConfig.getOAuthAPIConfig(),
      logger,
      connectionId: connection.value.connectionId,
    });
    if (token.isOk()) {
      return new Ok({ authType: "oauth", ...token.value });
    }

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

  if (!connection.value.credentialId) {
    return new Err(
      new DustError("connection_not_found", "No connection found for MCP server")
    );
  }

  if (connectionType !== "workspace") {
    return new Err(
      new DustError(
        "mcp_access_token_error",
        "Key-pair authentication is not supported for personal connections."
      )
    );
  }

  const internalServerRes = getInternalMCPServerNameAndWorkspaceId(mcpServerId);
  if (
    internalServerRes.isErr() ||
    internalServerRes.value.name !== "snowflake" ||
    internalServerRes.value.workspaceModelId !== auth.getNonNullableWorkspace().id
  ) {
    return new Err(
      new DustError(
        "mcp_access_token_error",
        "Key-pair authentication is only supported for the internal Snowflake MCP server."
      )
    );
  }

  const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
  const credentialRes = await oauthApi.getCredentials({
    credentialsId: connection.value.credentialId,
  });

  if (credentialRes.isErr()) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        mcpServerId,
        connectionType,
        credentialId: connection.value.credentialId,
        error: credentialRes.error,
      },
      "Failed to get credentials for MCP server"
    );
    return new Err(
      new DustError(
        "mcp_access_token_error",
        "Failed to get credentials for MCP server"
      )
    );
  }

  const { credential } = credentialRes.value;
  if (
    credential.metadata.workspace_id !== auth.getNonNullableWorkspace().sId ||
    credential.provider !== "snowflake" ||
    !isSnowflakeKeypairCredential(credential.content)
  ) {
    return new Err(
      new DustError(
        "mcp_access_token_error",
        "Snowflake key-pair credential is invalid or not accessible."
      )
    );
  }

  return new Ok({
    authType: "keypair",
    credentials: {
      account: credential.content.account,
      username: credential.content.username,
      role: credential.content.role,
      warehouse: credential.content.warehouse,
      private_key: credential.content.private_key,
      ...(credential.content.private_key_passphrase !== undefined
        ? { private_key_passphrase: credential.content.private_key_passphrase }
        : {}),
    },
  });
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
