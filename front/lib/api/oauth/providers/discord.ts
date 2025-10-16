import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class DiscordOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
    _extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    _extraConfig?: ExtraConfigType;
  }) {
    if (useCase !== "bot") {
      throw new Error(
        `Discord OAuth only supports "bot" use case, got: ${useCase}`
      );
    }

    const bot_scopes = ["bot"];

    const clientId = config.getOAuthDiscordClientId();

    return (
      `https://discord.com/api/oauth2/authorize?` +
      `client_id=${clientId}` +
      `&scope=${encodeURIComponent(bot_scopes.join("+"))}` +
      `&permissions=83968` + // Allows the bot to read message history, embed links, and send messages
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("discord"))}` +
      `&response_type=code` +
      `&state=${connection.connection_id}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, _useCase: OAuthUseCase) {
    // Discord doesn't require any extra config
    return Object.keys(extraConfig).length === 0;
  }
}
