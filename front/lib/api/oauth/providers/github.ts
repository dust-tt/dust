import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class GithubOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    if (useCase === "personal_actions") {
      // OAuth flow for personal connections (user access tokens)
      const clientId = config.getOAuthGithubAppPersonalActions();
      const redirectUri = finalizeUriForProvider("github");
      const url =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=repo`;

      return url;
    }

    if (useCase === "webhooks") {
      // OAuth flow for webhook management
      const clientId = config.getOAuthGithubAppWebhooks();
      const redirectUri = finalizeUriForProvider("github");
      const url =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${clientId}` +
        `&state=${connection.connection_id}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=repo,admin:repo_hook,read:org`;

      return url;
    }

    const app =
      useCase === "platform_actions"
        ? config.getOAuthGithubAppPlatformActions()
        : config.getOAuthGithubApp();

    return (
      `https://github.com/apps/${app}/installations/new` +
      `?state=${connection.connection_id}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    // OAuth flow returns "code", GitHub App installation returns "installation_id"
    // Both serve as authorization credentials for their respective flows
    return (
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      getStringFromQuery(query, "installation_id") ||
      getStringFromQuery(query, "code")
    );
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      return (
        Object.keys(extraConfig).length === 1 && "mcp_server_id" in extraConfig
      );
    }
    return Object.keys(extraConfig).length === 0;
  }
}
