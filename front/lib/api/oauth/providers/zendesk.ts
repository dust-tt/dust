import { isValidZendeskSubdomain } from "@app/lib/api/actions/servers/zendesk/types";
import config from "@app/lib/api/config";
import { getWorkspaceOAuthConnectionIdForMCPServer } from "@app/lib/api/oauth/mcp_server_connection_auth";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { ParsedUrlQuery } from "querystring";

export class ZendeskOAuthProvider implements BaseOAuthStrategyProvider {
  // Personal connections inherit the Zendesk subdomain from the workspace
  // connection set up by the admin, so that connection must exist first.
  requiresWorkspaceConnectionForPersonalAuth = true;

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

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    if (useCase === "personal_actions") {
      // If we have an mcp_server_id it means the admin already set up the
      // workspace connection, so we inherit the Zendesk subdomain from it.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    if (Object.keys(extraConfig).length !== 1) {
      return false;
    }
    return isValidZendeskSubdomain(extraConfig.zendesk_subdomain);
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
      // For personal actions we inherit the Zendesk subdomain from the existing
      // workspace connection (set up by the admin) identified by mcp_server_id.
      const { mcp_server_id, ...restConfig } = extraConfig;

      if (mcp_server_id) {
        const oauthConnectionIdRes =
          await getWorkspaceOAuthConnectionIdForMCPServer(auth, mcp_server_id);
        if (oauthConnectionIdRes.isErr()) {
          throw new Error(oauthConnectionIdRes.error.message);
        }

        const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
        const connectionRes = await oauthApi.getConnectionMetadata({
          connectionId: oauthConnectionIdRes.value,
        });
        if (connectionRes.isErr()) {
          throw new Error(
            "Failed to get connection metadata: " + connectionRes.error.message
          );
        }
        const connection = connectionRes.value.connection;

        return {
          ...restConfig,
          ...(connection.metadata.zendesk_subdomain && {
            zendesk_subdomain: connection.metadata.zendesk_subdomain,
          }),
        };
      }
    }

    return extraConfig;
  }
}
