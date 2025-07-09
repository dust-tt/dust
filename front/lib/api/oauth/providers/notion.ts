import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class NotionOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const clientId =
      useCase === "platform_actions"
        ? config.getOAuthNotionPlatformActionsClientId()
        : config.getOAuthNotionClientId();
    return (
      `https://api.notion.com/v1/oauth/authorize?owner=user` +
      `&response_type=code` +
      `&client_id=${clientId}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("notion"))}`
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
