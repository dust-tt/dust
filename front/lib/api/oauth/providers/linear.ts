import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class LinearOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes: string[] = ["read", "write"];
    if (useCase === "webhooks") {
      scopes.push("admin");
    }

    return (
      `https://linear.app/oauth/authorize` +
      `?client_id=${encodeURIComponent(config.getOAuthLinearClientId())}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("linear"))}` +
      `&scope=${encodeURIComponent(scopes.join(","))}` +
      `&state=${encodeURIComponent(connection.connection_id)}` +
      `&response_type=code`
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
