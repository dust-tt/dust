import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import { SnowflakeClient } from "@app/lib/api/actions/servers/snowflake/client";
import config from "@app/lib/api/config";
import type { OAuthError } from "@app/lib/api/oauth";
import type {
  BaseOAuthStrategyProvider,
  RelatedCredential,
} from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { Result } from "@app/types";
import { Err, OAuthAPI, Ok } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";
import { isValidSnowflakeRole } from "@app/types/oauth/lib";
import { isString } from "@app/types/shared/utils/general";

/**
 * Helper to determine if a user is connecting to a workspace-backed MCP server.
 * When true, credentials should be retrieved from the existing workspace connection
 * rather than requiring the user to provide client_secret directly.
 */
function isWorkspaceBacked(
  extraConfig: ExtraConfigType,
  useCase: OAuthUseCase
): boolean {
  return (
    (useCase === "personal_actions" || useCase === "platform_actions") &&
    isString(extraConfig.mcp_server_id) &&
    extraConfig.mcp_server_id.trim().length > 0
  );
}

/**
 * Fetches the workspace OAuth connection for an MCP server.
 * Used to get credentials from an existing admin-configured connection.
 */
async function getWorkspaceConnectionForMCPServer(
  auth: Authenticator,
  mcpServerId: string
): Promise<Result<OAuthConnectionType, OAuthError>> {
  const mcpServerConnectionRes =
    await MCPServerConnectionResource.findByMCPServer(auth, {
      mcpServerId,
      connectionType: "workspace",
    });

  if (mcpServerConnectionRes.isErr()) {
    return new Err({
      code: "credential_retrieval_failed",
      message:
        "Failed to find MCP server connection: " +
        mcpServerConnectionRes.error.message,
    });
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const connectionRes = await oauthApi.getAccessToken({
    connectionId: mcpServerConnectionRes.value.connectionId,
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
      // If workspace-backed, the admin already setup the connection.
      if (isWorkspaceBacked(extraConfig, useCase)) {
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
    // For workspace-backed connections, reuse the existing credential id from the
    // workspace connection (setup by admin).
    if (isWorkspaceBacked(extraConfig, useCase)) {
      const connectionResult = await getWorkspaceConnectionForMCPServer(
        auth,
        extraConfig.mcp_server_id as string
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
    // For workspace-backed personal connections, retrieve config from the workspace connection.
    if (
      useCase === "personal_actions" &&
      isWorkspaceBacked(extraConfig, useCase)
    ) {
      const { snowflake_role: userRole } = extraConfig;
      const connectionResult = await getWorkspaceConnectionForMCPServer(
        auth,
        extraConfig.mcp_server_id as string
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

    // Test the connection and warehouse access using SnowflakeClient.
    // listDatabases() will connect, set the warehouse, and run a simple query.
    const client = SnowflakeClient.createWithOAuth(
      snowflake_account,
      accessToken,
      snowflake_warehouse
    );
    const testResult = await client.listDatabases();

    if (testResult.isErr()) {
      return new Err({
        message: testResult.error.message,
      });
    }

    return new Ok(undefined);
  }
}
