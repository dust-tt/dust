import type { ParsedUrlQuery } from "querystring";
import querystring from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class MicrosoftToolsOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    clientId,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    extraConfig?: ExtraConfigType;
  }) {
    const scope = extraConfig?.scope;

    const qs = querystring.stringify({
      response_type: "code",
      client_id: clientId || config.getOAuthMicrosoftToolsClientId(),
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("microsoft_tools"),
      scope,
      prompt: "consent",
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${qs}`;
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // Allow scope to be specified for Microsoft Tools
      return true;
    }
    return Object.keys(extraConfig).length === 0;
  }
}