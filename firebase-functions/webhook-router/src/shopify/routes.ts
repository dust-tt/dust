import express from "express";
import { error, warn } from "firebase-functions/logger";

import type { SecretManager } from "../secrets.js";
import {
  createShopifyVerificationMiddleware,
  parseShopifyComplianceWebhookContext,
} from "./verification.js";

export function createShopifyRoutes(secretManager: SecretManager) {
  const router = express.Router();
  const shopifyVerification =
    createShopifyVerificationMiddleware(secretManager);

  router.post("/", shopifyVerification, (req, res) => {
    const context = parseShopifyComplianceWebhookContext(
      res.locals.shopifyComplianceWebhook
    );
    if (!context) {
      error("Verified Shopify compliance webhook is missing context", {
        component: "shopify-routes",
      });
      res.status(500).send();
      return;
    }

    // This ingress intentionally avoids logging customer and order data from the payload.
    warn(
      "Shopify compliance webhook received and requires privacy processing",
      {
        component: "shopify-routes",
        shopDomain: context.shopDomain,
        topic: context.topic,
        webhookId: context.webhookId,
      }
    );
    res.status(200).send();
  });

  return router;
}
