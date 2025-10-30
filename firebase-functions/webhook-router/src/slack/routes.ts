import type { RequestHandler } from "express";
import express from "express";

import { WebhookForwarder } from "../forwarder.js";
import type { SecretManager } from "../secrets.js";

export function createSlackRoutes(
  secretManager: SecretManager,
  slackVerification: RequestHandler
) {
  const router = express.Router();

  // Slack webhook endpoints with Slack verification only (webhook secret already validated)
  router.post("/events", slackVerification, async (req, res) => {
    await handleSlackWebhook(req, res, "slack_bot", secretManager);
  });

  router.post("/interactions", slackVerification, async (req, res) => {
    await handleSlackWebhook(req, res, "slack_bot_interaction", secretManager);
  });

  return router;
}

function isUrlVerification(req: express.Request): boolean {
  return (
    req.body &&
    typeof req.body === "object" &&
    "type" in req.body &&
    req.body.type === "url_verification" &&
    "challenge" in req.body
  );
}

async function handleSlackWebhook(
  req: express.Request,
  res: express.Response,
  endpoint: string,
  secretManager: SecretManager
): Promise<void> {
  try {
    // Handle Slack URL verification challenge.
    if (isUrlVerification(req)) {
      console.log("Handling URL verification challenge", {
        component: "slack-routes",
        endpoint,
      });
      res.status(200).json({ challenge: req.body.challenge });
      return;
    }

    // Respond immediately to Slack.
    res.status(200).send();

    // Get secrets for forwarding (already validated by middleware).
    const secrets = await secretManager.getSecrets();

    // Forward to regions asynchronously.
    await new WebhookForwarder(secrets).forwardToRegions({
      body: req.body,
      endpoint,
      headers: req.headers,
      method: req.method,
    });
  } catch (error) {
    console.error("Slack webhook router error", {
      component: "slack-routes",
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });

    if (!res.headersSent) {
      res.status(200).send();
    }
  }
}
