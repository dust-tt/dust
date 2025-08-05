import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";
import { isValidFreshserviceDomain } from "@app/types/oauth/lib";

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

    // Get domain from connection metadata
    const freshworksDomain = connection.metadata.instance_url;

    if (!isValidFreshserviceDomain(freshworksDomain)) {
      throw new Error("Invalid Freshservice domain");
    }

    return (
      `https://${freshworksDomain}/org/oauth/v2/authorize` +
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
    if (useCase === "personal_actions" || useCase === "platform_actions") {
      // For MCP servers, check both mcp_server_id and domain
      if (extraConfig.mcp_server_id) {
        return isValidFreshserviceDomain(extraConfig.instance_url);
      }
    }

    // For other use cases, domain is required
    if (Object.keys(extraConfig).length !== 1) {
      return false;
    }
    return isValidFreshserviceDomain(extraConfig.instance_url);
  }
}
