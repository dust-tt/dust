import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import type { ParsedUrlQuery } from "querystring";

export class IntercomOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    return (
      `https://app.intercom.com/oauth` +
      `?client_id=${config.getOAuthIntercomClientId()}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("intercom"))}`
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
