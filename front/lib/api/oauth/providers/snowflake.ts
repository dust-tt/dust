import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
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
import { OAuthAPI } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";
import { isString } from "@app/types/shared/utils/general";

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
): Promise<OAuthConnectionType> {
  const mcpServerConnectionRes =
    await MCPServerConnectionResource.findByMCPServer(auth, {
      mcpServerId,
      connectionType: "workspace",
    });

  if (mcpServerConnectionRes.isErr()) {
    throw new Error(
      "Failed to find MCP server connection: " +
        mcpServerConnectionRes.error.message
    );
  }

  const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
  const connectionRes = await oauthApi.getAccessToken({
    connectionId: mcpServerConnectionRes.value.connectionId,
  });

  if (connectionRes.isErr()) {
    throw new Error(
      "Failed to get connection metadata: " + connectionRes.error.message
    );
  }

  return connectionRes.value.connection;
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
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need (role can be overridden via snowflake_role in extraConfig).
      if (extraConfig.mcp_server_id) {
        return true;
      }
      // Initial admin setup - requires full credentials including default role
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.snowflake_account &&
        extraConfig.snowflake_role
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
  ): Promise<RelatedCredential> {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // For personal/platform actions we reuse the existing connection credential id from the
      // existing workspace connection (setup by admin) if we have it, otherwise we fallback to
      // assuming we have client_secret (initial admin setup).
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id && isString(mcp_server_id)) {
        const connection = await getWorkspaceConnectionForMCPServer(
          auth,
          mcp_server_id
        );

        return {
          content: {
            from_connection_id: connection.connection_id,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        };
      }
    }

    const { client_secret, client_id, snowflake_account, snowflake_role } =
      extraConfig;

    // Validate that all are strings before using them
    if (
      !isString(client_secret) ||
      !isString(client_id) ||
      !isString(snowflake_account) ||
      !isString(snowflake_role)
    ) {
      throw new Error(
        "Missing or invalid client_id, client_secret, snowflake_account, or snowflake_role in extraConfig"
      );
    }

    return {
      content: {
        client_secret,
        client_id,
        snowflake_account,
        snowflake_role,
      },
      metadata: { workspace_id: workspaceId, user_id: userId },
    };
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
      const { mcp_server_id, snowflake_role: userRole, ...restConfig } = extraConfig;

      if (mcp_server_id && isString(mcp_server_id)) {
        const connection = await getWorkspaceConnectionForMCPServer(
          auth,
          mcp_server_id
        );

        // Use user-provided role if specified, otherwise use the default role from workspace connection
        const role = userRole || connection.metadata.snowflake_role;

        return {
          client_id: connection.metadata.client_id,
          snowflake_account: connection.metadata.snowflake_account,
          snowflake_role: role,
          ...restConfig,
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }
}
