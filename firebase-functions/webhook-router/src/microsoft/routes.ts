import type { RequestHandler } from "express";
import express from "express";

import { WebhookForwarder } from "../forwarder.js";
import type { SecretManager } from "../secrets.js";
import { ALL_REGIONS } from "../webhook-router-config.js";

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
    // Get secrets for forwarding (already validated by middleware)
    const secrets = await secretManager.getSecrets();

    // Forward to regions asynchronously
    const responses = await new WebhookForwarder(secrets).forwardToRegions({
      body: req.body,
      endpoint,
      method: req.method,
      headers: req.headers,
      regions: ALL_REGIONS,
    });

    // Find one successful response that is a 200 status code
    const successfulResponse = responses
      .filter((response) => response.status === "fulfilled")
      .map((response) => response.value)
      .find((response) => response.status === 200);

    // If a successful response is found, return the response body
    if (successfulResponse) {
      const responseBody = await successfulResponse.json();
      res.set("Content-Type", "application/json; charset=utf-8");
      res.status(200).json(responseBody);
    }
  } catch (error) {
    console.error("Teams webhook router error", {
      component: "teams-routes",
      endpoint,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (!res.headersSent) {
      res.status(200).send();
    }
  }
}
