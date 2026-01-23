import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { isValidZendeskSubdomain } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class ZendeskOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    useCase,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    // Webhooks require write scope to create/manage webhooks
    let scopes;
    switch (useCase) {
      case "webhooks":
        scopes = ["webhooks:write"];
        break;
      case "platform_actions":
      case "personal_actions":
        scopes = ["read", "write"];
        break;
      default:
        scopes = ["read"];
        break;
    }
    if (!isValidZendeskSubdomain(connection.metadata.zendesk_subdomain)) {
      throw new Error("Invalid Zendesk subdomain");
    }
    return (
      `https://${connection.metadata.zendesk_subdomain}.zendesk.com/oauth/authorizations/new?` +
      `client_id=${config.getOAuthZendeskClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&response_type=code` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("zendesk"))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    if (Object.keys(extraConfig).length !== 1) {
      return false;
    }
    return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
  }
}
