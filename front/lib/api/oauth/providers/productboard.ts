import type { ParsedUrlQuery } from "querystring";

import config from "@app/lib/api/config";
import type { BaseOAuthStrategyProvider } from "@app/lib/api/oauth/providers/base_oauth_stragegy_provider";
import {
  finalizeUriForProvider,
  getStringFromQuery,
} from "@app/lib/api/oauth/utils";
import type { ExtraConfigType } from "@app/pages/w/[wId]/oauth/[provider]/setup";
import type { OAuthConnectionType, OAuthUseCase } from "@app/types/oauth/lib";

export class ProductboardOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({
    connection,
  }: {
    connection: OAuthConnectionType;
    useCase: OAuthUseCase;
  }) {
    const scopes = [
      "notes:create",
      "product_hierarchy_data:read",
      "product_hierarchy_data:manage",
      "members_pii:read", // List workspace members for product feedback assignment
    ];

    return (
      `https://app.productboard.com/oauth2/authorize?` +
      `client_id=${config.getOAuthProductboardClientId()}` +
      `&scope=${encodeURIComponent(scopes.join(" "))}` +
      `&response_type=code` +
      `&state=${connection.connection_id}` +
      `&redirect_uri=${encodeURIComponent(finalizeUriForProvider("productboard"))}`
    );
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isExtraConfigValid(extraConfig: ExtraConfigType) {
    // Productboard doesn't require any extra configuration (like subdomain)
    return Object.keys(extraConfig).length === 0;
  }
}
