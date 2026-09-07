import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";

import {
  type ShopifyComplianceTopic,
  verifyShopifyComplianceWebhook,
} from "./verification.js";

const CLIENT_SECRET = "shopify-client-secret";
const SHOP_DOMAIN = "dust-test.myshopify.com";

function makeWebhook({
  payload,
  topic,
}: {
  payload: unknown;
  topic: ShopifyComplianceTopic;
}) {
  const requestBody = Buffer.from(JSON.stringify(payload));
  const hmac = crypto
    .createHmac("sha256", CLIENT_SECRET)
    .update(requestBody)
    .digest("base64");

  return {
    headers: {
      "x-shopify-hmac-sha256": hmac,
      "x-shopify-shop-domain": SHOP_DOMAIN,
      "x-shopify-topic": topic,
      "x-shopify-webhook-id": "webhook-123",
    },
    requestBody,
  };
}

describe("verifyShopifyComplianceWebhook", () => {
  it("accepts each mandatory Shopify compliance topic", () => {
    const webhooks: Array<{
      payload: unknown;
      topic: ShopifyComplianceTopic;
    }> = [
      {
        topic: "customers/data_request",
        payload: {
          shop_id: 954889,
          shop_domain: SHOP_DOMAIN,
          orders_requested: [299938],
          customer: { id: 191167, email: "customer@example.com" },
          data_request: { id: 9999 },
        },
      },
      {
        topic: "customers/redact",
        payload: {
          shop_id: 954889,
          shop_domain: SHOP_DOMAIN,
          customer: { id: 191167, email: "customer@example.com" },
          orders_to_redact: [299938],
        },
      },
      {
        topic: "shop/redact",
        payload: {
          shop_id: 954889,
          shop_domain: SHOP_DOMAIN,
        },
      },
    ];

    for (const { payload, topic } of webhooks) {
      const result = verifyShopifyComplianceWebhook({
        clientSecret: CLIENT_SECRET,
        ...makeWebhook({ payload, topic }),
      });

      assert.equal(result.status, 200);
      if (result.status === 200) {
        assert.deepEqual(result.context, {
          shopDomain: SHOP_DOMAIN,
          topic,
          webhookId: "webhook-123",
        });
      }
    }
  });

  it("rejects an invalid HMAC", () => {
    const webhook = makeWebhook({
      topic: "shop/redact",
      payload: { shop_id: 954889, shop_domain: SHOP_DOMAIN },
    });

    assert.deepEqual(
      verifyShopifyComplianceWebhook({
        clientSecret: "wrong-secret",
        ...webhook,
      }),
      { status: 401, error: "Invalid Shopify webhook signature" }
    );
  });

  it("rejects a payload that does not match its topic", () => {
    const webhook = makeWebhook({
      topic: "customers/redact",
      payload: { shop_id: 954889, shop_domain: SHOP_DOMAIN },
    });

    assert.deepEqual(
      verifyShopifyComplianceWebhook({
        clientSecret: CLIENT_SECRET,
        ...webhook,
      }),
      { status: 400, error: "Invalid compliance webhook payload" }
    );
  });

  it("rejects a store domain that differs from the signed payload", () => {
    const webhook = makeWebhook({
      topic: "shop/redact",
      payload: { shop_id: 954889, shop_domain: SHOP_DOMAIN },
    });

    assert.deepEqual(
      verifyShopifyComplianceWebhook({
        clientSecret: CLIENT_SECRET,
        requestBody: webhook.requestBody,
        headers: {
          ...webhook.headers,
          "x-shopify-shop-domain": "another-store.myshopify.com",
        },
      }),
      { status: 400, error: "Shopify store domain mismatch" }
    );
  });
});
