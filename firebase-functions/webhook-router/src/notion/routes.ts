import type { RequestHandler } from "express";
import express from "express";

import { WebhookForwarder } from "../forwarder.js";
import type { SecretManager } from "../secrets.js";
import { ALL_REGIONS } from "../webhook-router-config.js";

export function createNotionRoutes(secretManager: SecretManager, notionVerification: RequestHandler) {
  const router = express.Router();

  // Notion webhook endpoint with Notion verification only (webhook secret already validated)
  router.post("/", notionVerification, async (req, res) => {
    await handleNotionWebhook(req, res, "notion", secretManager);
  });

  return router;
}

async function handleNotionWebhook(
  req: express.Request,
  res: express.Response,
  endpoint: string,
  secretManager: SecretManager
): Promise<void> {
  try {
    // Respond immediately to Notion.
    res.status(200).send();

    // Get secrets for forwarding (already validated by middleware).
    const secrets = await secretManager.getSecrets();

    // Forward to regions asynchronously.
    await new WebhookForwarder(secrets).forwardToRegions({
      body: req.body,
      endpoint,
      headers: req.headers,
      method: req.method,
      regions: ALL_REGIONS,
    });
  } catch (error) {
    console.error("Notion webhook router error", {
      component: "notion-routes",
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });

    if (!res.headersSent) {
      res.status(200).send();
    }
  }
}
