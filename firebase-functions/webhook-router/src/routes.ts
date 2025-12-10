import express from "express";
import { error } from "firebase-functions/logger";

import { createTeamsRoutes } from "./microsoft/routes.js";
import { createTeamsVerificationMiddleware } from "./microsoft/verification.js";
import { createNotionRoutes } from "./notion/routes.js";
import type { SecretManager } from "./secrets.js";
import {
  createSlackBotRoutes,
  createSlackDataSyncRoutes,
} from "./slack/routes.js";
import type { WebhookRouterConfigManager } from "./webhook-router-config.js";

// Webhook secret validation middleware (shared by all platforms)
function createWebhookSecretMiddleware(secretManager: SecretManager) {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      const { webhookSecret } = req.params;
      if (!webhookSecret) {
        res.status(404).send("Not found");
        return;
      }

      const secrets = await secretManager.getSecrets();
      if (webhookSecret !== secrets.webhookSecret) {
        error("Invalid webhook secret provided", {
          component: "webhook-secret-validation",
        });
        res.status(404).send("Not found");
        return;
      }

      next();
    } catch (e) {
      error("Webhook secret validation failed", {
        component: "webhook-secret-validation",
        error: e instanceof Error ? e.message : String(e),
      });
      res.status(500).send("Internal server error");
    }
  };
}

export function createRoutes(
  secretManager: SecretManager,
  webhookRouterConfigManager: WebhookRouterConfigManager
) {
  const router = express.Router();

  // Create shared webhook secret validation middleware
  const webhookSecretValidation = createWebhookSecretMiddleware(secretManager);

  // Create platform-specific verification middlewares (without webhook secret validation)
  const teamsVerification = createTeamsVerificationMiddleware(secretManager);

  // Mount platform routes with webhook secret validation first
  const slackDataSyncRoutes = createSlackDataSyncRoutes(
    secretManager,
    webhookRouterConfigManager
  );
  router.use("/slack_data_sync", slackDataSyncRoutes);

  const notionInternalIntegrationRoutes = createNotionRoutes(
    secretManager,
    webhookRouterConfigManager,
    true
  );
  router.use("/notion/:providerWorkspaceId", notionInternalIntegrationRoutes);

  const slackBotRoutes = createSlackBotRoutes(
    secretManager,
    webhookRouterConfigManager
  );
  router.use("/:webhookSecret/slack", webhookSecretValidation, slackBotRoutes);

  const teamsRoutes = createTeamsRoutes(secretManager, teamsVerification);
  router.use("/:webhookSecret/microsoft", webhookSecretValidation, teamsRoutes);

  const notionRoutes = createNotionRoutes(
    secretManager,
    webhookRouterConfigManager,
    false
  );
  router.use("/:webhookSecret/notion", webhookSecretValidation, notionRoutes);

  return router;
}
