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

    // Get domain from connection metadata
    const freshworksDomainRaw = connection.metadata.instance_url;

    if (!freshworksDomainRaw) {
      throw new Error("Freshworks domain is required");
    }

    // Normalize the Freshworks domain (remove protocol and trailing slash)
    const freshworksDomain = freshworksDomainRaw
      .trim() // Remove whitespace
      .replace(/^https?:\/\//, '') // Remove protocol
      .replace(/\/$/, ''); // Remove trailing slash

    if (!freshworksDomain) {
      throw new Error("Invalid Freshworks domain format");
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
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need the instance_url and client_id.
      if (extraConfig.mcp_server_id) {
        return true;
      }
      // For personal/platform actions without MCP server, still need the standard validation
      return !!extraConfig.instance_url && !!extraConfig.client_id;
    }

    // For other use cases, both domains are required
    if (Object.keys(extraConfig).length !== 2) {
      return false;
    }
    return !!extraConfig.instance_url && !!extraConfig.client_id;
  }

}
