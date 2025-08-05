import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class FreshserviceOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "freshservice.departments.view",
      "freshservice.oncall.view",
      "freshservice.products.view",
      "freshservice.purchase_orders.view",
      "freshservice.requesters.fields.view",
      "freshservice.requesters.view",
      "freshservice.service_catalog.view",
      "freshservice.sla_policies.view",
      "freshservice.solutions.publish",
      "freshservice.solutions.view",
      "freshservice.statuspage.incidents.publish",
      "freshservice.statuspage.incidents.view",
      "freshservice.statuspage.view",
      "freshservice.tickets.conversations.create",
      "freshservice.tickets.conversations.edit",
      "freshservice.tickets.conversations.view",
      "freshservice.tickets.create",
      "freshservice.tickets.tasks.create",
      "freshservice.tickets.tasks.view",
      "freshservice.tickets.time_entries.create",
      "freshservice.tickets.time_entries.edit",
      "freshservice.tickets.time_entries.view",
      "freshservice.tickets.view",
    ];
    
    // Domain should be in format: yourcompany.freshservice.com (without https://)
    const freshworksDomain = config.getOAuthFreshserviceDomain();
    
    return (
      `https://${freshworksDomain}/oauth/v2/authorize` +
      `?response_type=code` +
      `&client_id=${config.getOAuthFreshserviceClientId()}` +
      `&state=${connection.connection_id}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("freshservice"))}`
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