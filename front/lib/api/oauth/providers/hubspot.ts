import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import logger from "@app/logger/logger";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import { Err, OAuthAPI, Ok } from "@app/types";
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

  async getUpdatedExtraConfig(
    auth: Authenticator,
    {
      extraConfig,
      useCase,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    if (useCase === "personal_actions") {
      // For personal actions we fetch the hub_id (portal ID) of the admin-setup to enforce 
      // the user connects to the same HubSpot portal as configured by the admin.
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const mcpServerConnectionRes =
          await MCPServerConnectionResource.findByMCPServer(auth, {
            mcpServerId: mcp_server_id,
            connectionType: "workspace",
          });

        if (mcpServerConnectionRes.isErr()) {
          throw new Error(
            "Failed to find MCP server connection: " +
              mcpServerConnectionRes.error.message
          );
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: mcpServerConnectionRes.value.connectionId,
        });
        if (connectionRes.isErr()) {
          logger.error(
            "Failed to get connection metadata for admin-setup connection when updating the config for personal actions",
            {
              error: connectionRes.error,
            }
          );
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }

        const hubId = connectionRes.value.connection.metadata.hub_id;
        const hubDomain = connectionRes.value.connection.metadata.hub_domain;

        return {
          ...restConfig,
          requested_hub_id: hubId,
          requested_hub_domain: hubDomain,
        };
      }
    }

    return extraConfig;
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      // For personal actions, we require an mcp_server_id that references the admin-configured connection
      return (
        Object.keys(extraConfig).length === 1 && "mcp_server_id" in extraConfig
      );
    }
    return Object.keys(extraConfig).length === 0;
  }

  checkConnectionValidPostFinalize(connection: OAuthConnectionType) {
    // If a specific HubSpot hub_id (portal ID) was requested, we need to check that 
    // the connected hub_id matches the admin-configured one.
    if ("requested_hub_id" in connection.metadata) {
      if (
        connection.metadata.hub_id === connection.metadata.requested_hub_id
      ) {
        return new Ok(undefined);
      }
      return new Err({
        message:
          "You must connect to the HubSpot workspace configured by your admin " +
          `(Portal ID: ${connection.metadata.requested_hub_id}), ` +
          `but you connected to Portal ID: ${connection.metadata.hub_id}.`,
      });
    }
    return new Ok(undefined);
  }
}
