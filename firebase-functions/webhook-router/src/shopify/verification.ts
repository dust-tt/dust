import crypto from "crypto";
import type { Request, RequestHandler } from "express";
import { error } from "firebase-functions/logger";
import type { IncomingHttpHeaders } from "http";
import rawBody from "raw-body";
import { z } from "zod";

import type { SecretManager } from "../secrets.js";

const SHOPIFY_STORE_DOMAIN_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/;

const ShopifyIdSchema = z.union([
  z.number().int().nonnegative(),
  z.string().regex(/^\d+$/),
]);

const BasePayloadSchema = z
  .object({
    shop_id: ShopifyIdSchema,
    shop_domain: z.string().regex(SHOPIFY_STORE_DOMAIN_RE),
  })
  .passthrough();

const CustomerDataRequestPayloadSchema = BasePayloadSchema.extend({
  customer: z.object({ id: ShopifyIdSchema }).passthrough(),
  data_request: z.object({ id: ShopifyIdSchema }).passthrough(),
  orders_requested: z.array(ShopifyIdSchema),
});

const CustomerRedactPayloadSchema = BasePayloadSchema.extend({
  customer: z.object({ id: ShopifyIdSchema }).passthrough(),
  orders_to_redact: z.array(ShopifyIdSchema),
});

export const SHOPIFY_COMPLIANCE_TOPICS = [
  "customers/data_request",
  "customers/redact",
  "shop/redact",
] as const;

const ShopifyComplianceTopicSchema = z.enum(SHOPIFY_COMPLIANCE_TOPICS);
export type ShopifyComplianceTopic = z.infer<
  typeof ShopifyComplianceTopicSchema
>;

const ShopifyComplianceWebhookContextSchema = z.object({
  shopDomain: z.string().regex(SHOPIFY_STORE_DOMAIN_RE),
  topic: ShopifyComplianceTopicSchema,
  webhookId: z.string().min(1),
});
export type ShopifyComplianceWebhookContext = z.infer<
  typeof ShopifyComplianceWebhookContextSchema
>;

type ShopifyComplianceWebhookVerificationResult =
  | {
      status: 200;
      context: ShopifyComplianceWebhookContext;
    }
  | {
      status: 400 | 401;
      error: string;
    };

function getHeader(
  headers: IncomingHttpHeaders,
  name: string
): string | undefined {
  const value = headers[name.toLowerCase()];
  return typeof value === "string" ? value : undefined;
}

export function parseShopifyComplianceWebhookContext(
  value: unknown
): ShopifyComplianceWebhookContext | undefined {
  const result = ShopifyComplianceWebhookContextSchema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function isValidShopifyWebhookHmac({
  clientSecret,
  hmac,
  requestBody,
}: {
  clientSecret: string;
  hmac: string;
  requestBody: Buffer;
}): boolean {
  const receivedDigest = Buffer.from(hmac, "base64");
  const expectedDigest = crypto
    .createHmac("sha256", clientSecret)
    .update(requestBody)
    .digest();

  return (
    receivedDigest.length === expectedDigest.length &&
    crypto.timingSafeEqual(receivedDigest, expectedDigest)
  );
}

function isValidPayloadForTopic(
  topic: ShopifyComplianceTopic,
  payload: unknown
): boolean {
  switch (topic) {
    case "customers/data_request":
      return CustomerDataRequestPayloadSchema.safeParse(payload).success;
    case "customers/redact":
      return CustomerRedactPayloadSchema.safeParse(payload).success;
    case "shop/redact":
      return BasePayloadSchema.safeParse(payload).success;
    default: {
      const exhaustiveTopic: never = topic;
      error("Unhandled Shopify compliance webhook topic", {
        component: "shopify-verification",
        topic: exhaustiveTopic,
      });
      return false;
    }
  }
}

export function verifyShopifyComplianceWebhook({
  clientSecret,
  headers,
  requestBody,
}: {
  clientSecret: string;
  headers: IncomingHttpHeaders;
  requestBody: Buffer;
}): ShopifyComplianceWebhookVerificationResult {
  const hmac = getHeader(headers, "x-shopify-hmac-sha256");
  if (
    !hmac ||
    !isValidShopifyWebhookHmac({ clientSecret, hmac, requestBody })
  ) {
    return { status: 401, error: "Invalid Shopify webhook signature" };
  }

  const topicResult = ShopifyComplianceTopicSchema.safeParse(
    getHeader(headers, "x-shopify-topic")
  );
  if (!topicResult.success) {
    return { status: 400, error: "Unsupported Shopify webhook topic" };
  }

  const webhookId = getHeader(headers, "x-shopify-webhook-id");
  const headerShopDomain = getHeader(headers, "x-shopify-shop-domain");
  if (!webhookId || !headerShopDomain) {
    return { status: 400, error: "Missing Shopify webhook headers" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(requestBody.toString("utf8"));
  } catch {
    return { status: 400, error: "Invalid JSON payload" };
  }

  const basePayloadResult = BasePayloadSchema.safeParse(payload);
  if (
    !basePayloadResult.success ||
    !isValidPayloadForTopic(topicResult.data, payload)
  ) {
    return { status: 400, error: "Invalid compliance webhook payload" };
  }

  if (basePayloadResult.data.shop_domain !== headerShopDomain) {
    return { status: 400, error: "Shopify store domain mismatch" };
  }

  return {
    status: 200,
    context: {
      shopDomain: basePayloadResult.data.shop_domain,
      topic: topicResult.data,
      webhookId,
    },
  };
}

// On Firebase Functions and GCP, req.rawBody is provided for signature verification.
async function parseExpressRequestRawBody(req: Request): Promise<Buffer> {
  if (req !== null && "rawBody" in req && Buffer.isBuffer(req.rawBody)) {
    return Promise.resolve(req.rawBody);
  }

  return rawBody(req);
}

export function createShopifyVerificationMiddleware(
  secretManager: SecretManager
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      const requestBody = await parseExpressRequestRawBody(req);
      const secrets = await secretManager.getSecrets();
      if (!secrets.shopifyClientSecret) {
        error("Shopify client secret is not configured", {
          component: "shopify-verification",
        });
        res.status(500).send();
        return;
      }

      const result = verifyShopifyComplianceWebhook({
        clientSecret: secrets.shopifyClientSecret,
        headers: req.headers,
        requestBody,
      });

      if (result.status !== 200) {
        error("Shopify compliance webhook verification failed", {
          component: "shopify-verification",
          error: result.error,
          status: result.status,
        });
        res.status(result.status).send();
        return;
      }

      res.locals.shopifyComplianceWebhook = result.context;
      return next();
    } catch (e) {
      error("Shopify compliance webhook verification failed", {
        component: "shopify-verification",
        error: e instanceof Error ? e.message : String(e),
      });
      res.status(500).send();
    }
  };
}
