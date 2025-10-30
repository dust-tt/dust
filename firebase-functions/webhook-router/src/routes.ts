import express from "express";

import { createTeamsRoutes } from "./microsoft/routes.js";
import { createTeamsVerificationMiddleware } from "./microsoft/verification.js";
import type { SecretManager } from "./secrets.js";
import { createSlackRoutes } from "./slack/routes.js";
import { createSlackVerificationMiddleware } from "./slack/verification.js";

// Webhook secret validation middleware (shared by all platforms)
function createWebhookSecretMiddleware(secretManager: SecretManager) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const { webhookSecret } = req.params;
      if (!webhookSecret) {
        res.status(404).send("Not found");
        return;
      }

      const secrets = await secretManager.getSecrets();
      if (webhookSecret !== secrets.webhookSecret) {
        console.error("Invalid webhook secret provided", {
          component: "webhook-secret-validation",
        });
        res.status(404).send("Not found");
        return;
      }

      next();
    } catch (error) {
      console.error("Webhook secret validation failed", {
        component: "webhook-secret-validation",
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send("Internal server error");
    }
  };
}

export function createRoutes(secretManager: SecretManager) {
  const router = express.Router();

  // Create shared webhook secret validation middleware
  const webhookSecretValidation = createWebhookSecretMiddleware(secretManager);

  // Create platform-specific verification middlewares (without webhook secret validation)
  const slackVerification = createSlackVerificationMiddleware(secretManager);
  const teamsVerification = createTeamsVerificationMiddleware(secretManager);

  // Mount platform routes with webhook secret validation first
  const slackRoutes = createSlackRoutes(secretManager, slackVerification);
  router.use("/:webhookSecret/slack", webhookSecretValidation, slackRoutes);

  const teamsRoutes = createTeamsRoutes(secretManager, teamsVerification);
  router.use("/:webhookSecret/microsoft", webhookSecretValidation, teamsRoutes);

  return router;
}
