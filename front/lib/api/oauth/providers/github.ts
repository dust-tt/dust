import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import { getStringFromQuery } from "@app/lib/api/oauth/utils";
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
    const app =
      useCase === "platform_actions"
        ? config.getOAuthGithubAppPlatformActions()
        : config.getOAuthGithubApp();
    // Only the `installations/new` URL supports state passing.
    return (
      `https://github.com/apps/${app}/installations/new` +
      `?state=${connection.connection_id}`
    );
  }
  // {
  //   installation_id: '52689080',
  //   setup_action: 'update',
  //   state: 'con_...-...',
  //   provider: 'github'
  // }
  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "installation_id");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    return Object.keys(extraConfig).length === 0;
  }
}
