import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
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

export class JiraOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    extraConfig?: ExtraConfigType;
  }) {
    if (extraConfig && Object.keys(extraConfig).length > 0) {
      throw new Error("extraConfig is not supported for JIRA OAuth");
    }
    const scopes = [
      // Read permissions
      "read:jira-work",
      "read:jira-user",
      "read:issue:jira",
      "read:issue.property:jira",
      "read:project:jira",
      "read:user:jira",

      // Required for OAuth refresh token
      "offline_access",
    ];
    return (
      `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
      `&client_id=${config.getOAuthJiraClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("jira"))}` +
      `&state=${connection.connection_id}` +
      `&response_type=code&prompt=consent`
    );
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
      // everything we need, otherwise we'll need the client_id and client_secret.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    } else if (useCase === "platform_actions") {
      return !!(extraConfig.client_id && extraConfig.client_secret);
    }
    return Object.keys(extraConfig).length === 0;
  }

  async getRelatedCredential(
    auth: Authenticator,
    extraConfig: ExtraConfigType,
    workspaceId: string,
    userId: string,
    useCase: OAuthUseCase
  ): Promise<{
    credential: {
      content: Record<string, string>;
      metadata: { workspace_id: string; user_id: string };
    };
    cleanedConfig: ExtraConfigType;
  } | null> {
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
          return null;
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getAccessToken({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });
        if (connectionRes.isErr()) {
          return null;
        }
        const connection = connectionRes.value.connection;
        const connectionId = connection.connection_id;

        return {
          credential: {
            content: {
              from_connection_id: connectionId,
            },
            metadata: { workspace_id: workspaceId, user_id: userId },
          },
          cleanedConfig: {
            client_id: connection.metadata.client_id,
            ...restConfig,
          },
        };
      }
    }

    const { client_secret, ...restConfig } = extraConfig;
    // Keep client_id in metadata in clear text.
    return {
      credential: {
        content: {
          client_secret: client_secret,
          client_id: extraConfig.client_id,
        },
        metadata: { workspace_id: workspaceId, user_id: userId },
      },
      cleanedConfig: restConfig,
    };
  }
}
