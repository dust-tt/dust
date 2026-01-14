import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

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
import config from "@app/lib/api/config";
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

    const account = extraConfig.snowflake_account;

    // Snowflake OAuth scope specifies the role to use. We use SYSADMIN by default
    // since ACCOUNTADMIN/SECURITYADMIN are typically blocked for OAuth.
    // Users can still access data based on SYSADMIN's privileges.
    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId,
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("snowflake"),
      scope: "session:role:SYSADMIN",
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
    if (useCase === "personal_actions") {
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need the client_id, client_secret, and snowflake_account.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    } else if (useCase === "platform_actions") {
      return !!(
        extraConfig.client_id &&
        extraConfig.client_secret &&
        extraConfig.snowflake_account
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
    if (useCase === "personal_actions") {
      // For personal actions we reuse the existing connection credential id from the existing
      // workspace connection (setup by admin) if we have it, otherwise we fallback to assuming
      // we have client_secret (initial admin setup).
      const { mcp_server_id } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer(auth, {
            mcpServerId: mcp_server_id,
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
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return {
          content: {
            from_connection_id: connectionId,
          },
          metadata: { workspace_id: workspaceId, user_id: userId },
        };
      }
    }

    const { client_secret } = extraConfig;

    // Validate that both are strings before using them
    if (!isString(client_secret) || !isString(extraConfig.client_id)) {
      throw new Error(
        "Missing or invalid client_id or client_secret in extraConfig"
      );
    }

    return {
      content: {
        client_secret,
        client_id: extraConfig.client_id,
      },
      metadata: {
        workspace_id: workspaceId,
        user_id: userId,
        snowflake_account: extraConfig.snowflake_account,
      },
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
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer(auth, {
            mcpServerId: mcp_server_id,
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
        const connection = connectionRes.value.connection;

        return {
          client_id: connection.metadata.client_id,
          snowflake_account: connection.metadata.snowflake_account,
          ...restConfig,
        };
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- we filter out the client_secret from the extraConfig.
    const { client_secret, ...restConfig } = extraConfig;

    return restConfig;
  }
}
