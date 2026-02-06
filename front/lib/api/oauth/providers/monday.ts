import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/types";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class MondayOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "me:read",
      "boards:read",
      "boards:write",
      "updates:read",
      "updates:write",
      "users:read",
      "workspaces:read",
    ];

    return (
      `https://auth.monday.com/oauth2/authorize` +
      `?client_id=${config.getOAuthMondayClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("monday"))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    // Allow mcp_server_id for MCP server connections
    const allowedKeys = ["mcp_server_id"];
    const keys = Object.keys(extraConfig);
    return keys.length === 0 || keys.every((key) => allowedKeys.includes(key));
  }
}
