import config from "@app/lib/api/config";
import { getWorkspaceOAuthConnectionForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { isValidAtlassianCloudUrlOrEmpty } from "@app/types/oauth/lib";
import type { ParsedUrlQuery } from "querystring";

export class ConfluenceToolsOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({ connection }: { connection: OAuthConnectionType }) {
    const scopes = [
      // Read permissions
      "read:page:confluence",
      "read:confluence-content.all",
      "read:space:confluence",
      "search:confluence",
      "read:confluence-user",
      "read:me",

      // Write permissions
      "write:confluence-content",
      "write:page:confluence",

      // Required for OAuth refresh token
      "offline_access",
    ];
    return (
      `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
      `&client_id=${config.getOAuthConfluenceToolsClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider({ provider: "confluence_tools", connection }))}` +
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
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // Existing workspace connection may already pin confluence_cloud_url.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    // confluence_cloud_url is optional — absent or empty means fall back to dynamic resolution.
    return isValidAtlassianCloudUrlOrEmpty(extraConfig.confluence_cloud_url);
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
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );
        if (connectionRes.isOk()) {
          const connection = connectionRes.value;
          return {
            ...restConfig,
            ...(connection.metadata.confluence_cloud_url && {
              confluence_cloud_url: connection.metadata.confluence_cloud_url,
            }),
          };
        }
        if (useCase === "personal_actions") {
          throw new Error(connectionRes.error.message);
        }
        // platform_actions first connect: fall through.
      }
    }

    return extraConfig;
  }
}
