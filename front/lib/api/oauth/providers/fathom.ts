import type { ParsedUrlQuery } from "querystring";

import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class FathomOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    // Fathom OAuth is only supported for webhooks use case
    if (useCase !== "webhooks") {
      throw new Error("Fathom OAuth is only supported for webhooks use case");
    }

    // Note: These values will need to be configured in the environment
    // Client ID and Secret should be obtained from Fathom OAuth app setup
    const clientId = process.env.OAUTH_FATHOM_CLIENT_ID || "";
    const redirectUri = finalizeUriForProvider("fathom");

    // Fathom OAuth authorization endpoint
    // Based on Fathom OAuth documentation at https://developers.fathom.ai/sdks/oauth
    // Authorization URL: https://fathom.video/oauth/authorize (inferred from token endpoint)
    // Token endpoint: https://fathom.video/external/v1/oauth2/token
    // Scope: public_api (only available scope for Fathom API)
    const url =
      `https://fathom.video/oauth/authorize?` +
      `client_id=${clientId}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=public_api`;

    return url;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    // Fathom doesn't require extra config for webhooks
    return Object.keys(extraConfig).length === 0;
  }
}
