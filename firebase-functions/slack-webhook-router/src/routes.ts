import type { RequestHandler } from "express";
import express from "express";
import { WebhookForwarder } from "./forwarder.js";
import type { SecretManager } from "./secrets.js";

export function createRoutes(
  secretManager: SecretManager,
  slackVerification: RequestHandler
) {
  const router = express.Router();

  // Webhook endpoints with combined webhook + Slack verification.
  router.post("/:webhookSecret/events", slackVerification, async (req, res) => {
    await handleWebhook(req, res, "slack_bot", secretManager);
  });

  router.post(
    "/:webhookSecret/interactions",
    slackVerification,
    async (req, res) => {
      await handleWebhook(req, res, "slack_bot_interaction", secretManager);
    }
  );

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

async function handleWebhook(
  req: express.Request,
  res: express.Response,
  endpoint: string,
  secretManager: SecretManager
): Promise<void> {
  try {
    // Handle Slack URL verification challenge.
    if (isUrlVerification(req)) {
      console.log("Handling URL verification challenge", {
        component: "routes",
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
      method: req.method,
      headers: req.headers,
    });
  } catch (error) {
    console.error("Webhook router error", {
      component: "routes",
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });

    if (!res.headersSent) {
      res.status(200).send();
    }
  }
}
