import config from "@app/lib/api/config";
import type { OAuthError } from "@app/lib/api/oauth";
import { getWorkspaceOAuthConnectionIdForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { escapeSnowflakeIdentifier } from "@app/lib/utils/snowflake";
import logger from "@app/logger/logger";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { isValidSnowflakeRole } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";
import type {
  Connection,
  ConnectionOptions,
  SnowflakeError,
} from "snowflake-sdk";
import snowflake from "snowflake-sdk";

/**
 * Snowflake OAuth provider for MCP server integration.
 *
 * Snowflake OAuth requires:
 * 1. Account identifier (e.g., "abc123.us-east-1" or "myorg-myaccount")
 * 2. Client ID and Client Secret from customer's security integration
 *
 * The OAuth endpoints are account-specific:
 * - Authorization: https://<account>.snowflakecomputing.com/oauth/authorize
 * - Token: https://<account>.snowflakecomputing.com/oauth/token-request
 */
/**
 * Helper to fetch the workspace OAuth connection for an MCP server.
 * Used to get credentials from an existing admin-configured connection.
 */
async function getWorkspaceConnectionForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<OAuthConnectionType, OAuthError>> {
  const oauthConnectionIdRes = await getWorkspaceOAuthConnectionIdForMCPServer(
    auth,
    mcpServerId
  );
  if (oauthConnectionIdRes.isErr()) {
    return new Err({
      code: "credential_retrieval_failed",
      message:
        oauthConnectionIdRes.error.kind === "oauth_not_configured"
          ? "Workspace Snowflake MCP connection is not configured for OAuth. " +
            "Personal Snowflake connections are OAuth-only. Please ask an admin to configure OAuth for this Snowflake MCP server."
          : oauthConnectionIdRes.error.message,
    });
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const connectionRes = await oauthApi.getAccessToken({
    connectionId: oauthConnectionIdRes.value,
  });

  if (connectionRes.isErr()) {
    return new Err({
      code: "credential_retrieval_failed",
      message:
        "Failed to get connection metadata: " + connectionRes.error.message,
      oAuthAPIError: connectionRes.error,
    });
  }

  return new Ok(connectionRes.value.connection);
}

export class SnowflakeOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
    clientId,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    extraConfig?: ExtraConfigType;
  }) {
    if (!extraConfig || !extraConfig.snowflake_account) {
      throw new Error("Missing Snowflake account identifier");
    }

    if (!clientId) {
      throw new Error("Missing client ID for Snowflake");
    }

    if (!extraConfig.snowflake_role) {
      throw new Error("Missing Snowflake role");
    }

    const account = extraConfig.snowflake_account;
    const role = extraConfig.snowflake_role;

    // For Custom OAuth, use session:role:<ROLE> to specify the role.
    // The role is set by admin as default, users can override during personal auth.
    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("snowflake"),
      scope: `session:role:${role.toUpperCase()}`,
    });

    // Build account-specific authorization URL
    const authUrl = `https://${account.trim()}.snowflakecomputing.com/oauth/authorize?${qs}`;
    return authUrl;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection.
      if (extraConfig.mcp_server_id) {
        return true;
      }
      // Initial admin setup - requires full credentials including default role and warehouse
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.snowflake_account &&
        extraConfig.snowflake_role &&
        extraConfig.snowflake_warehouse
      );
    }
    return Object.keys(extraConfig).length === 0;
  }

  async getRelatedCredential(
    auth: Authenticator,
    {
      extraConfig,
      workspaceId,
      userId,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      workspaceId: string;
      userId: string;
      useCase: OAuthUseCase;
    }
  ): Promise<Result<RelatedCredential, OAuthError>> {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // For personal/platform actions we reuse the existing connection credential id from the
      // existing workspace connection (setup by admin) if we have it, otherwise we fallback to
      // assuming we have client_secret (initial admin setup).
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id && isString(mcp_server_id)) {
        const connectionResult = await getWorkspaceConnectionForMCPServer(
          auth,
          mcp_server_id
        );

        if (connectionResult.isErr()) {
          return connectionResult;
        }

        return new Ok({
          content: {
            from_connection_id: connectionResult.value.connection_id,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        });
      }
    }

    const {
      client_secret,
      client_id,
      snowflake_account,
      snowflake_role,
      snowflake_warehouse,
    } = extraConfig;

    // Validate that all are strings before using them
    if (
      !isString(client_secret) ||
      !isString(client_id) ||
      !isString(snowflake_account) ||
      !isString(snowflake_role) ||
      !isString(snowflake_warehouse)
    ) {
      return new Err({
        code: "credential_retrieval_failed",
        message:
          "Missing or invalid client_id, client_secret, snowflake_account, snowflake_role, or snowflake_warehouse in extraConfig",
      });
    }

    return new Ok({
      content: {
        client_secret,
        client_id,
        snowflake_account,
        snowflake_role,
        snowflake_warehouse,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    });
  }

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_secret (initial admin setup).
      const { mcp_server_id, snowflake_role: userRole } = extraConfig;

      if (mcp_server_id && isString(mcp_server_id)) {
        const connectionResult = await getWorkspaceConnectionForMCPServer(
          auth,
          mcp_server_id
        );

        if (connectionResult.isErr()) {
          throw new Error(connectionResult.error.message);
        }

        const {
          client_id: wsClientId,
          snowflake_account: wsAccount,
          snowflake_role: wsRole,
          snowflake_warehouse: wsWarehouse,
        } = connectionResult.value.metadata;

        if (
          !isString(wsClientId) ||
          !isString(wsAccount) ||
          !isString(wsRole) ||
          !isString(wsWarehouse)
        ) {
          throw new Error(
            "Workspace connection is missing required Snowflake configuration. " +
              "Please ask an admin to reconfigure the MCP server connection."
          );
        }

        // Use user-provided role if specified, otherwise use the default from workspace connection.
        let role = wsRole;
        const trimmedUserRole = isString(userRole) ? userRole.trim() : "";
        if (trimmedUserRole) {
          if (!isValidSnowflakeRole(trimmedUserRole)) {
            throw new Error(
              `Invalid Snowflake role format: "${trimmedUserRole}". ` +
                "Role must start with a letter or underscore and contain only alphanumeric characters and underscores."
            );
          }
          role = trimmedUserRole;
        }

        return {
          client_id: wsClientId,
          snowflake_account: wsAccount,
          snowflake_role: role,
          snowflake_warehouse: wsWarehouse,
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }

  async checkConnectionValidPostFinalize(
    connection: OAuthConnectionType
  ): Promise<Result<void, { message: string }>> {
    const { snowflake_account, snowflake_warehouse } = connection.metadata;

    if (!isString(snowflake_account) || !isString(snowflake_warehouse)) {
      return new Err({
        message:
          "Missing Snowflake account or warehouse configuration. Please try again.",
      });
    }

    // Get the access token
    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const accessTokenRes = await oauthApi.getAccessToken({
      connectionId: connection.connection_id,
    });

    if (accessTokenRes.isErr()) {
      return new Err({
        message:
          "Unable to retrieve Snowflake access token. Please try connecting again.",
      });
    }

    const accessToken = accessTokenRes.value.access_token;

    // Test the connection and warehouse access
    const testResult = await this.testWarehouseAccess(
      snowflake_account,
      accessToken,
      snowflake_warehouse
    );

    if (testResult.isErr()) {
      return new Err({
        message: testResult.error.message,
      });
    }

    return new Ok(undefined);
  }

  /**
   * Test that the OAuth token can connect and use the specified warehouse.
   */
  private async testWarehouseAccess(
    account: string,
    accessToken: string,
    warehouse: string
  ): Promise<Result<void, Error>> {
    // Configure SDK to suppress verbose logging
    snowflake.configure({ logLevel: "OFF" });

    try {
      const connectionOptions: ConnectionOptions = {
        account: account.replace(/_/g, "-"),
        authenticator: "OAUTH",
        token: accessToken,
      };

      // Connect to Snowflake
      const connection = await new Promise<Connection>((resolve, reject) => {
        const conn = snowflake.createConnection(connectionOptions);
        conn.connect((err: SnowflakeError | undefined, c: Connection) => {
          if (err) {
            reject(err);
          } else {
            resolve(c);
          }
        });
      });

      // Try to use the warehouse
      try {
        await new Promise<void>((resolve, reject) => {
          connection.execute({
            sqlText: `USE WAREHOUSE "${escapeSnowflakeIdentifier(warehouse)}"`,
            complete: (err: SnowflakeError | undefined) => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            },
          });
        });
      } catch {
        // Clean up connection
        connection.destroy(() => {});
        return new Err(
          new Error(
            `The role does not have access to warehouse "${warehouse}". ` +
              `Please ensure the role has USAGE privilege on the warehouse, or choose a different warehouse.`
          )
        );
      }

      // Clean up connection
      connection.destroy(() => {});
      return new Ok(undefined);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown connection error";
      return new Err(new Error(`Failed to connect to Snowflake: ${message}`));
    }
  }
}
