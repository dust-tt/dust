import config from "@app/lib/api/config";
import type { OAuthError } from "@app/lib/api/oauth";
import {
  getWorkspaceOAuthConnectionForMCPServer,
  shouldFallThroughPlatformWorkspaceReuse,
} from "@app/lib/api/oauth/mcp_server_connection_auth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { parseOptionalInt } from "@app/lib/utils/parseOptionalInt";
import { escapeSnowflakeIdentifier } from "@app/lib/utils/snowflake";
import logger from "@app/logger/logger";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import {
  isValidSnowflakeAccount,
  isValidSnowflakeRole,
  snowflakeRoleToOAuthScope,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";
import type {
  Connection,
  ConnectionOptions,
  SnowflakeError,
} from "snowflake-sdk";

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

    // For Custom OAuth, the scope specifies the role (see snowflakeRoleToOAuthScope).
    // The role is set by admin as default, users can override during personal auth.
    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider({
        provider: "snowflake",
        connection,
      }),
      scope: snowflakeRoleToOAuthScope(role),
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

  /**
   * @cc [owner:fontanierh,label:security] validate-account-identifier
   * When `snowflake_account` comes from the caller rather than from the workspace connection, it
   * MUST satisfy `isValidSnowflakeAccount`, otherwise the config is invalid. The account is
   * interpolated into the authorize and token URL hosts, so values such as `evil.example/x?` MUST
   * be rejected server-side, not only by the setup UI.
   */
  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // An mcp_server_id without a typed account means reusing the workspace connection
      // (personal connection or admin Refresh).
      if (
        extraConfig.mcp_server_id &&
        extraConfig.snowflake_account === undefined
      ) {
        return true;
      }
      // Admin setup - requires full credentials including default role and warehouse
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        isValidSnowflakeAccount(extraConfig.snowflake_account) &&
        extraConfig.snowflake_role &&
        extraConfig.snowflake_warehouse
      );
    }
    return Object.keys(extraConfig).length === 0;
  }

  /**
   * @cc [owner:philipperolet,label:product] admin-setup-without-workspace-connection
   * For `platform_actions`, an `mcp_server_id` in `extraConfig` MUST NOT make setup fail when the
   * MCP server has no workspace connection: the credential is then built from the caller-supplied
   * `extraConfig` fields.
   */
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
        const connectionResult = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );

        if (connectionResult.isOk()) {
          return new Ok({
            content: {
              from_connection_id: connectionResult.value.connection_id,
            },
            metadata: { workspace_id: workspaceId, user_id: userId },
            redirectUri: connectionResult.value.redirect_uri,
          });
        }
        const { error } = connectionResult;
        if (!shouldFallThroughPlatformWorkspaceReuse({ useCase, error })) {
          return new Err({
            code: "credential_retrieval_failed",
            message:
              error.kind === "oauth_not_configured"
                ? "Workspace Snowflake MCP connection is not configured for OAuth. " +
                  "Personal Snowflake connections are OAuth-only. Please ask an admin to configure OAuth for this Snowflake MCP server."
                : error.message,
            ...(error.kind === "oauth_metadata_failed" && {
              oAuthAPIError: error.oAuthAPIError,
            }),
          });
        }
        // platform_actions first connect only: no workspace connection yet.
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

  /**
   * @cc [owner:philipperolet,label:security] reuse-workspace-connection-settings
   * When the workspace connection exists for `mcp_server_id`, `client_id`, `snowflake_account` and
   * `snowflake_warehouse` MUST come from that connection, never from the caller, since its client
   * secret is reused. Only `snowflake_role` MAY be overridden by the caller.
   */
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
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // For personal/platform actions we reuse the existing connection credential id from the
      // existing workspace connection (setup by admin) if we have it, otherwise we fallback to
      // assuming we have client_secret (initial admin setup).
      const { mcp_server_id, snowflake_role: userRole } = extraConfig;

      if (mcp_server_id && isString(mcp_server_id)) {
        const connectionResult = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );

        if (connectionResult.isOk()) {
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
                  "Role must be non-empty and at most 255 characters."
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
        if (
          !shouldFallThroughPlatformWorkspaceReuse({
            useCase,
            error: connectionResult.error,
          })
        ) {
          throw new Error(connectionResult.error.message);
        }
        // platform_actions first connect only: no workspace connection yet.
      }
    }

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
      logger.error(
        {
          provider: "snowflake",
          connectionId: connection.connection_id,
          snowflakeAccount: snowflake_account,
          snowflakeWarehouse: snowflake_warehouse,
          oAuthAPIError: accessTokenRes.error,
        },
        "[Snowflake OAuth] Failed to retrieve access token during post-finalize check"
      );
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
      snowflake_warehouse,
      connection.connection_id
    );

    if (testResult.isErr()) {
      logger.error(
        {
          provider: "snowflake",
          connectionId: connection.connection_id,
          snowflakeAccount: snowflake_account,
          snowflakeWarehouse: snowflake_warehouse,
          err: testResult.error,
        },
        "[Snowflake OAuth] Warehouse access check failed during post-finalize"
      );
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
    warehouse: string,
    connectionId: string
  ): Promise<Result<void, Error>> {
    // Loaded here rather than at module scope: the SDK is 884 modules (it pulls
    // the AWS, Azure and GCS storage clients) and only this check needs it.
    const snowflake = (await import("snowflake-sdk")).default;
    snowflake.configure({ logLevel: "OFF" });

    const logCtx = {
      provider: "snowflake",
      connectionId,
      snowflakeAccount: account,
      snowflakeWarehouse: warehouse,
    };

    let connection: Connection;
    try {
      const connectionOptions: ConnectionOptions = {
        account: account.replace(/_/g, "-"),
        authenticator: "OAUTH",
        token: accessToken,

        // Route through the static-IP proxy when configured so customers with
        // an IP-restricted Snowflake network policy (allowlisting only Dust's
        // static egress IP) can complete the warehouse access check. Mirrors
        // the runtime client at `lib/api/actions/servers/snowflake/client.ts`.
        proxyHost: EnvironmentConfig.getOptionalEnvVariable("PROXY_HOST"),
        proxyPort: parseOptionalInt(
          EnvironmentConfig.getOptionalEnvVariable("PROXY_PORT")
        ),
        proxyUser: EnvironmentConfig.getOptionalEnvVariable("PROXY_USER_NAME"),
        proxyPassword: EnvironmentConfig.getOptionalEnvVariable(
          "PROXY_USER_PASSWORD"
        ),
      };

      connection = await new Promise<Connection>((resolve, reject) => {
        const conn = snowflake.createConnection(connectionOptions);
        conn.connect((err: SnowflakeError | undefined, c: Connection) => {
          if (err) {
            reject(err);
          } else {
            resolve(c);
          }
        });
      });
    } catch (error) {
      const normalized = normalizeError(error);
      logger.error(
        {
          ...logCtx,
          err: normalized,
        },
        "[Snowflake OAuth] Failed to connect to Snowflake during warehouse test"
      );
      return new Err(
        new Error(`Failed to connect to Snowflake: ${normalized.message}`)
      );
    }

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
    } catch (error) {
      const normalized = normalizeError(error);
      logger.error(
        {
          ...logCtx,
          err: normalized,
        },
        "[Snowflake OAuth] USE WAREHOUSE failed during connection test"
      );
      return new Err(
        new Error(
          `The role does not have access to warehouse "${warehouse}". ` +
            `Please ensure the role has USAGE privilege on the warehouse, or choose a different warehouse.`
        )
      );
    } finally {
      // Clean up connection
      connection.destroy(() => {});
    }

    return new Ok(undefined);
  }
}
