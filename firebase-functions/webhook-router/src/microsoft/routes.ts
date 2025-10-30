import type { RequestHandler } from "express";
import express from "express";

import { WebhookForwarder } from "../forwarder.js";
import type { SecretManager } from "../secrets.js";

export function createTeamsRoutes(
  secretManager: SecretManager,
  teamsVerification: RequestHandler
) {
  const router = express.Router();

  // Teams webhook endpoints with Bot Framework verification only (webhook secret already validated)
  router.post("/teams/messages", teamsVerification, async (req, res) => {
    await handleTeamsWebhook(req, res, "microsoft_teams_bot", secretManager);
  });

  return router;
}

async function handleTeamsWebhook(
  req: express.Request,
  res: express.Response,
  endpoint: string,
  secretManager: SecretManager
): Promise<void> {
  try {
    // Respond immediately to Teams (Bot Framework expects 200)
    res.status(200).send();

    // Get secrets for forwarding (already validated by middleware)
    const secrets = await secretManager.getSecrets();

    // Forward to regions asynchronously
    await new WebhookForwarder(secrets).forwardToRegions({
      body: req.body,
      endpoint,
      method: req.method,
      headers: req.headers,
    });
  } catch (error) {
    console.error("Teams webhook router error", {
      component: "teams-routes",
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });

    if (!res.headersSent) {
      res.status(200).send();
    }
  }
}
