import express from "express";

import { WebhookForwarder } from "./forwarder.js";
import type { SecretManager } from "./secrets.js";
import type { GracefulServer } from "./server.js";
import type { RequestHandler } from "express";

export function createRoutes(
  secretManager: SecretManager,
  gracefulServer: GracefulServer,
  slackVerification: RequestHandler
) {
  const router = express.Router();

  // Health endpoints.
  router.get("/health", (req, res) => {
    if (!gracefulServer.isHealthy()) {
      res.status(503).json({ status: "shutting down" });
      return;
    }
    res.status(200).json({ status: "healthy" });
  });

  router.get("/ready", async (req, res) => {
    try {
      await secretManager.getSecrets();
      res.status(200).json({ status: "ready" });
    } catch (error) {
      console.error("Failed to load secrets", {
        component: "routes",
        error: error instanceof Error ? error.message : String(error),
      });

      res
        .status(503)
        .json({ status: "not ready", error: "Failed to load secrets" });
    }
  });

  // Webhook endpoints with combined webhook + Slack verification.
  router.post("/:webhookSecret/events", slackVerification, async (req, res) => {
    await handleWebhook(req, res, "slack_bot", secretManager, gracefulServer);
  });

  router.post(
    "/:webhookSecret/interactions",
    slackVerification,
    async (req, res) => {
      await handleWebhook(
        req,
        res,
        "slack_bot_interaction",
        secretManager,
        gracefulServer
      );
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
  secretManager: SecretManager,
  gracefulServer: GracefulServer
): Promise<void> {
  try {
    // Check if service is available.
    if (!gracefulServer.isHealthy()) {
      res.status(503).send("Service unavailable");
      return;
    }

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
