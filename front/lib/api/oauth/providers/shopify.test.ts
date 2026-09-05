import { createHmac } from "node:crypto";
import {
  isValidShopifyCallback,
  ShopifyOAuthProvider,
} from "@app/lib/api/oauth/providers/shopify";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getOAuthRedirectBaseUrl: () => "https://dust.tt",
    getDevOAuthRedirectBaseUrl: () => undefined,
    getOAuthShopifyClientId: () => "shopify-client-id",
    getOAuthShopifyClientSecret: () => "shopify-client-secret",
  },
}));

function makeConnection(storeDomain: string): OAuthConnectionType {
  return {
    connection_id: "con_shopify",
    created: Date.now(),
    metadata: { shopify_store_domain: storeDomain },
    provider: "shopify",
    status: "pending",
  };
}

describe("ShopifyOAuthProvider", () => {
  it("builds a store-scoped authorization URL", () => {
    const provider = new ShopifyOAuthProvider();
    const url = new URL(
      provider.setupUri({
        connection: makeConnection("my-store.myshopify.com"),
      })
    );

    expect(url.origin).toBe("https://my-store.myshopify.com");
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("shopify-client-id");
    expect(url.searchParams.get("scope")).toBe(
      "read_all_orders,read_customers,read_orders,read_products"
    );
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://dust.tt/oauth/shopify/finalize"
    );
    expect(url.searchParams.get("state")).toBe("con_shopify");
  });

  it("only accepts a Shopify shop for platform actions", () => {
    const provider = new ShopifyOAuthProvider();

    expect(
      provider.isExtraConfigValid(
        { shopify_store_domain: "my-store.myshopify.com" },
        "platform_actions"
      )
    ).toBe(true);
    expect(
      provider.isExtraConfigValid(
        { shopify_store_domain: "my-store.myshopify.com" },
        "personal_actions"
      )
    ).toBe(false);
    expect(
      provider.isExtraConfigValid(
        { shopify_store_domain: "shop.example.com" },
        "platform_actions"
      )
    ).toBe(false);
  });
});

describe("isValidShopifyCallback", () => {
  it("validates Shopify's callback HMAC", () => {
    const query = {
      code: "authorization-code",
      shop: "my-store.myshopify.com",
      state: "con_shopify",
      timestamp: "1787654321",
    };
    const message = Object.entries(query)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const hmac = createHmac("sha256", "shopify-client-secret")
      .update(message)
      .digest("hex");

    expect(
      isValidShopifyCallback({ ...query, hmac }, "shopify-client-secret")
    ).toBe(true);
    expect(
      isValidShopifyCallback(
        { ...query, code: "tampered", hmac },
        "shopify-client-secret"
      )
    ).toBe(false);
  });
});
