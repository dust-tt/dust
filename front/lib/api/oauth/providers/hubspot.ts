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
    // Required scopes - user must have access to these
    const requiredScopes = ["oauth"];

    // Optional scopes - user can still install app without these
    const optionalScopes = [
      "crm.objects.contacts.read",
      "crm.objects.contacts.write",
      "crm.schemas.contacts.read",
      "crm.objects.companies.read",
      "crm.objects.companies.write",
      "crm.schemas.companies.read",
      "crm.objects.deals.read",
      "crm.objects.deals.write",
      "crm.schemas.deals.read",
      "crm.objects.owners.read",
      "crm.schemas.custom.read",
      "crm.objects.custom.read",
      "files",
      "sales-email-read",
      "timeline",
      "crm.lists.read",
      "crm.lists.write",
    ];

    return (
      `https://app.hubspot.com/oauth/authorize` +
      `?client_id=${config.getOAuthHubspotClientId()}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("hubspot"))}` +
      `&scope=${encodeURIComponent(requiredScopes.join(" "))}` +
      `&optional_scope=${encodeURIComponent(optionalScopes.join(" "))}` +
      `&state=${connection.connection_id}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    return Object.keys(extraConfig).length === 0;
  }
}
