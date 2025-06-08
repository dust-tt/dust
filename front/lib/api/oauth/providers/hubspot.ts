import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class HubspotOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "oauth",
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.schemas.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.schemas.companies.read",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.schemas.deals.read",
      "tickets",
      "crm.objects.owners.read",
      "crm.schemas.custom.read",
      "crm.objects.custom.read",
      "files",
      "sales-email-read",
      "timeline",
      "crm.lists.read",
      "crm.lists.write",
      "automation",
    ];
    return (
      `https://app.hubspot.com/oauth/authorize` +
      `?client_id=${config.getOAuthHubspotClientId()}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("hubspot"))}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&state=${connection.connection_id}`
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
