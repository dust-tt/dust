import express from "express";
import type { App } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";

import { createRoutes } from "./routes.js";
import { SecretManager } from "./secrets.js";
import { WebhookRouterConfigManager } from "./webhook-router-config.js";

/**
 * Creates and configures the Express application
 */
export function createApp(firebase: App): express.Application {
  // Initialize dependencies.
  const secretManager = new SecretManager();
  const webhookRouterConfigManager = new WebhookRouterConfigManager(
    getDatabase(firebase)
  );

  // Create Express app.
  const app = express();
  // No body parsing middleware needed - verification middlewares handle it.

  // Setup routes with verification middlewares.
  const routes = createRoutes(secretManager, webhookRouterConfigManager);

  app.use(routes);

  return app;
}
