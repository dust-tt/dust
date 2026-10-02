import config from "@app/lib/api/config";
import {
  getWorkspaceOAuthConnectionForMCPServer,
  shouldFallThroughPlatformWorkspaceReuse,
} from "@app/lib/api/oauth/mcp_server_connection_auth";
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

export class JiraOAuthProvider implements BaseOAuthStrategyProvider {
  requiresWorkspaceConnectionForPersonalAuth = true;

  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      // Read permissions
      "read:jira-work",
      "read:jira-user",
      "read:issue:jira",
      "read:issue.property:jira",
      "read:project:jira",
      "read:user:jira",

      // Write permissions
      "write:jira-work",

      // Required for OAuth refresh token
      "offline_access",
    ];

    if (useCase === "webhooks") {
      scopes.push("manage:jira-webhook");
    }

    return (
      `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
      `&client_id=${config.getOAuthJiraClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider({ provider: "jira", connection }))}` +
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
      // Existing workspace connection may already pin jira_cloud_url.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    // cloud_url is optional — absent or empty means fall back to dynamic resolution.
    return isValidAtlassianCloudUrlOrEmpty(extraConfig.jira_cloud_url);
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
            ...(connection.metadata.jira_cloud_url && {
              jira_cloud_url: connection.metadata.jira_cloud_url,
            }),
          };
        }
        if (
          !shouldFallThroughPlatformWorkspaceReuse({
            useCase,
            error: connectionRes.error,
          })
        ) {
          throw new Error(connectionRes.error.message);
        }
        // platform_actions first connect only: no workspace connection yet.
      }
    }

    return extraConfig;
  }
}
