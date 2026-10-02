import { isValidZendeskSubdomain } from "@app/lib/api/actions/servers/zendesk/types";
import config from "@app/lib/api/config";
import {
  getWorkspaceOAuthConnectionForMCPServer,
  shouldFallThroughPlatformWorkspaceReuse,
} from "@app/lib/api/oauth/mcp_server_connection_auth";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { Authenticator } from "@app/lib/auth";
import type {
  ExtraConfigType,
  OAuthConnectionType,
  OAuthUseCase,
} from "@app/types/oauth/lib";
import { assertNever } from "@app/types/shared/utils/assert_never";
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
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider({ provider: "zendesk", connection }))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    switch (useCase) {
      case "personal_actions":
      case "platform_actions":
        // Existing workspace connection already has the Zendesk subdomain.
        if (extraConfig.mcp_server_id) {
          return true;
        }
        break;
      case "connection":
      case "labs_transcripts":
      case "bot":
      case "webhooks":
        break;
      default:
        assertNever(useCase);
    }

    // Otherwise the config must be exactly a valid Zendesk subdomain.
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
    switch (useCase) {
      case "personal_actions":
      case "platform_actions": {
        const { mcp_server_id, ...restConfig } = extraConfig;

        if (!mcp_server_id) {
          return extraConfig;
        }

        const connectionRes = await getWorkspaceOAuthConnectionForMCPServer(
          auth,
          mcp_server_id
        );
        if (connectionRes.isErr()) {
          if (
            shouldFallThroughPlatformWorkspaceReuse({
              useCase,
              error: connectionRes.error,
            })
          ) {
            // First connect only: no workspace connection yet.
            return extraConfig;
          }
          throw new Error(connectionRes.error.message);
        }
        const connection = connectionRes.value;
        const { zendesk_subdomain } = connection.metadata;

        if (!zendesk_subdomain) {
          throw new Error(
            "Zendesk workspace connection is missing a subdomain; " +
              "cannot set up a connection from it."
          );
        }

        return {
          ...restConfig,
          zendesk_subdomain,
        };
      }
      case "connection":
      case "labs_transcripts":
      case "bot":
      case "webhooks":
        return extraConfig;
      default:
        assertNever(useCase);
    }
  }
}
