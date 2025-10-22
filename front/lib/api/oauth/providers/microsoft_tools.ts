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
    useCase,
    clientId,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    clientId?: string;
    extraConfig?: ExtraConfigType;
  }) {
    if (useCase === "bot") {
      extraConfig = {
        scope:
          "Sites.Read.All Files.Read.All User.Read Chat.Read Team.ReadBasic.All Channel.ReadBasic.All Organization.Read.All",
      };
    }

    if (!extraConfig || !extraConfig.scope) {
      throw new Error("Missing authorization scope");
    }

    const qs = querystring.stringify({
      response_type: "code",
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      client_id: clientId || config.getOAuthMicrosoftToolsClientId(),
      state: connection.connection_id,
      redirect_uri: finalizeUriForProvider("microsoft_tools"),
      scope: extraConfig.scope,
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
      // Require scope to be specified for Microsoft Tools
      return !!extraConfig.scope;
    }
    return Object.keys(extraConfig).length === 0;
  }
}
