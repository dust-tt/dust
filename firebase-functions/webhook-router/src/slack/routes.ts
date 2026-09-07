import express from "express";
import { error } from "firebase-functions/logger";

import { WebhookForwarder } from "../forwarder.js";
import type { SecretManager } from "../secrets.js";
import type { WebhookRouterConfigManager } from "../webhook-router-config.js";
import { ALL_CELLS } from "../webhook-router-config.js";
import { createSlackVerificationMiddleware } from "./verification.js";

export function createSlackBotRoutes(
  secretManager: SecretManager,
  webhookRouterConfigManager: WebhookRouterConfigManager
) {
  const router = express.Router();
  const slackVerification = createSlackVerificationMiddleware(
    secretManager,
    webhookRouterConfigManager,
    {
      useClientCredentials: false,
    }
  );

  // Slack webhook endpoints with Slack verification only (webhook secret already validated)
  router.post("/events", slackVerification, async (req, res) => {
    await handleSlackWebhook(req, res, "slack_bot", secretManager);
  });

  router.post("/interactions", slackVerification, async (req, res) => {
    await handleSlackWebhook(req, res, "slack_bot_interaction", secretManager);
  });

  return router;
}

export function createSlackDataSyncRoutes(
  secretManager: SecretManager,
  webhookRouterConfigManager: WebhookRouterConfigManager
) {
  const router = express.Router();
  const slackVerification = createSlackVerificationMiddleware(
    secretManager,
    webhookRouterConfigManager,
    {
      useClientCredentials: true,
    }
  );

  router.post("/events", slackVerification, async (req, res) => {
    await handleSlackWebhook(req, res, "slack", secretManager);
  });

  router.post("/interactions", slackVerification, async (req, res) => {
    await handleSlackWebhook(req, res, "slack_interaction", secretManager);
  });

  return router;
}

async function handleSlackWebhook(
  req: express.Request,
  res: express.Response,
  endpoint: string,
  secretManager: SecretManager
): Promise<void> {
  try {
    // Respond immediately to Slack.
    res.status(200).send();

    // Get secrets for forwarding (already validated by middleware).
    const secrets = await secretManager.getSecrets();

    // Forward to cells asynchronously.
    await new WebhookForwarder(secrets).forwardToCells({
      body: req.body,
      endpoint,
      headers: req.headers,
      method: req.method,
      cells: req.cells ?? ALL_CELLS,
    });
  } catch (e) {
    error("Slack webhook router error", {
      component: "slack-routes",
      endpoint,
      error: e instanceof Error ? e.message : String(e),
    });

    if (!res.headersSent) {
      res.status(200).send();
    }
  }
}
