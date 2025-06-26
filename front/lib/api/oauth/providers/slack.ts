import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class SlackOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    const default_scopes = [
      "app_mentions:read",
      "channels:history",
      "channels:join",
      "channels:read",
      "chat:write",
      "groups:history",
      "groups:read",
      "im:history",
      "metadata.message:read",
      "mpim:read",
      "team:read",
      "users:read",
      "users:read.email",
      "im:read",
      "mpim:history",
      "files:read",
    ];

    let user_scopes: string[] = [];
    let bot_scopes: string[] = [...default_scopes];

    if (extraConfig?.scope) {
      const scopes_raw = extraConfig.scope.split(" ");

      // it's a bit of hack here to split the scopes into user and bot scopes which is a slack specific thing.
      user_scopes = scopes_raw
        .filter((scope) => scope.startsWith("user_scope:"))
        .map((scope) => scope.replace("user_scope:", ""));

      bot_scopes = scopes_raw.filter(
        (scope) => !scope.startsWith("user_scope")
      );

      if (user_scopes.length !== 0 && bot_scopes.length !== 0) {
        // To simplify the implementation, we don't support both user and bot scopes at the same time.
        throw new Error("User and bot scopes cannot be set at the same time.");
      }
    }

    return (
      `https://slack.com/oauth/v2/authorize?` +
      `client_id=${config.getOAuthSlackClientId()}` +
      (bot_scopes.length > 0
        ? `&scope=${encodeURIComponent(bot_scopes.join(" "))}`
        : "") +
      (user_scopes.length > 0
        ? `&user_scope=${encodeURIComponent(user_scopes.join(" "))}`
        : "") +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("slack"))}` +
      `&state=${connection.connection_id}`
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
      return "scope" in extraConfig;
    }
    return Object.keys(extraConfig).length === 0;
  }
}
