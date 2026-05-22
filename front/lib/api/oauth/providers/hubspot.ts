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
import { z } from "zod";

const ALL_OPTIONAL_SCOPES = [
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
  "crm.objects.quotes.read",
  "crm.objects.line_items.read",
  "files",
  "sales-email-read",
  "timeline",
  "crm.lists.read",
  "crm.lists.write",
  "marketing-email",
  "content",
] as const;

const HubSpotScrubbed = z.object({ scope: z.string() }).passthrough();

export class HubspotOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
    extraConfig,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
    extraConfig?: ExtraConfigType;
  }) {
    const requiredScopes = ["oauth"];

    const workspaceGrantedScopes = extraConfig?.workspace_granted_scopes;
    const grantedSet =
      workspaceGrantedScopes && workspaceGrantedScopes.length > 0
        ? new Set(workspaceGrantedScopes.split(" "))
        : null;
    const optionalScopes = grantedSet
      ? ALL_OPTIONAL_SCOPES.filter((s) => grantedSet.has(s))
      : ALL_OPTIONAL_SCOPES;

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
    if (useCase !== "personal_actions" || !extraConfig.mcp_server_id) {
      return extraConfig;
    }

    const oauthConnectionIdRes =
      await getWorkspaceOAuthConnectionIdForMCPServer(
        auth,
        extraConfig.mcp_server_id
      );
    if (oauthConnectionIdRes.isErr()) {
      throw new Error(oauthConnectionIdRes.error.message);
    }

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);
    const tokenRes = await oauthApi.getAccessToken({
      connectionId: oauthConnectionIdRes.value,
    });
    if (tokenRes.isErr()) {
      throw new Error(
        "Failed to get workspace connection: " + tokenRes.error.message
      );
    }

    const parsed = HubSpotScrubbed.safeParse(tokenRes.value.scrubbed_raw_json);
    const workspaceGrantedScopes = parsed.success ? parsed.data.scope : "";

    return {
      ...extraConfig,
      workspace_granted_scopes: workspaceGrantedScopes,
    };
  }
}
