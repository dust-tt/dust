import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/types/oauth/lib";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class GongOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "api:calls:read:transcript",
      "api:calls:read:extensive",
      "api:calls:read:basic",
      "api:users:read",
    ];
    return (
      `https://app.gong.io/oauth2/authorize?` +
      `client_id=${config.getOAuthGongClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&response_type=code` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("gong"))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    return Object.keys(extraConfig).length === 0;
  }
}
