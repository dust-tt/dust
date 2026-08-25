import { createHmac, timingSafeEqual } from "node:crypto";
import config from "@app/lib/api/config";
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
import {
  isValidShopifyStoreDomain,
  normalizeShopifyStoreDomain,
} from "@app/types/oauth/lib";
import type { ParsedUrlQuery } from "querystring";

const SHOPIFY_SCOPES = [
  "read_all_orders",
  "read_customers",
  "read_orders",
  "read_products",
] as const;

export function isValidShopifyCallback(
  query: ParsedUrlQuery,
  clientSecret: string
): boolean {
  const hmac = getStringFromQuery(query, "hmac");
  const storeDomain = getStringFromQuery(query, "shop");
  if (
    !hmac ||
    !/^[a-f0-9]{64}$/i.test(hmac) ||
    !isValidShopifyStoreDomain(storeDomain)
  ) {
    return false;
  }

  const message = Object.entries(query)
    .filter(([key]) => key !== "hmac")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${key}=${Array.isArray(value) ? value.join(",") : (value ?? "")}`
    )
    .join("&");
  const digest = createHmac("sha256", clientSecret)
    .update(message)
    .digest("hex");

  return timingSafeEqual(Buffer.from(digest), Buffer.from(hmac));
}

export class ShopifyOAuthProvider implements BaseOAuthStrategyProvider {
  setupUri({ connection }: { connection: OAuthConnectionType }) {
    const storeDomain = normalizeShopifyStoreDomain(
      connection.metadata.store_domain
    );
    if (!storeDomain) {
      throw new Error("Invalid Shopify store domain");
    }

    const url = new URL(`https://${storeDomain}/admin/oauth/authorize`);
    url.searchParams.set("client_id", config.getOAuthShopifyClientId());
    url.searchParams.set("scope", SHOPIFY_SCOPES.join(","));
    url.searchParams.set("redirect_uri", finalizeUriForProvider("shopify"));
    url.searchParams.set("state", connection.connection_id);
    return url.toString();
  }

  codeFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "code");
  }

  connectionIdFromQuery(query: ParsedUrlQuery) {
    return getStringFromQuery(query, "state");
  }

  isCallbackQueryValid(query: ParsedUrlQuery) {
    return isValidShopifyCallback(query, config.getOAuthShopifyClientSecret());
  }

  isExtraConfigValid(extraConfig: ExtraConfigType, useCase: OAuthUseCase) {
    return (
      useCase === "platform_actions" &&
      Object.keys(extraConfig).length === 1 &&
      isValidShopifyStoreDomain(extraConfig.store_domain)
    );
  }

  async getUpdatedExtraConfig(
    _auth: Authenticator,
    {
      extraConfig,
    }: {
      extraConfig: ExtraConfigType;
      useCase: OAuthUseCase;
    }
  ): Promise<ExtraConfigType> {
    const storeDomain = normalizeShopifyStoreDomain(extraConfig.store_domain);
    return storeDomain ? { store_domain: storeDomain } : extraConfig;
  }
}
