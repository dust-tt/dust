import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class ConfluenceToolsOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({ connection }: { connection: OAuthConnectionType }) {
    const scopes = [
      // Read permissions
      "read:page:confluence",
      "read:confluence-content.all",
      "search:confluence",
      "read:confluence-user",

      // Write permissions
      "write:confluence-content",
      "write:page:confluence",

      // Required for OAuth refresh token
      "offline_access",
    ];
    return (
      `https://auth.atlassian.com/authorize?audience=api.atlassian.com` +
      `&client_id=${config.getOAuthConfluenceToolsClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("confluence_tools"))}` +
      `&state=${connection.connection_id}` +
      `&response_type=code&prompt=consent`
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
      // If we have an mcp_server_id it means the admin already setup the connection and we have
      // everything we need, otherwise we'll need the client_id and client_secret.
      if (extraConfig.mcp_server_id) {
        return true;
      }
    }
    return Object.keys(extraConfig).length === 0;
  }
}
