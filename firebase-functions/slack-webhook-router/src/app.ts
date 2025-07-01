import express from "express";
import { createRoutes } from "./routes.js";
import { SecretManager } from "./secrets.js";
import { createSlackVerificationMiddleware } from "./slack-verification.js";

/**
 * Creates and configures the Express application
 */
export async function createApp(): Promise<express.Application> {
  // Initialize dependencies.
  const secretManager = new SecretManager();

  // Create Slack verification middleware.
  const slackVerification = createSlackVerificationMiddleware(secretManager);

  // Create Express app.
  const app = express();
  // No body parsing middleware needed - Slack verification handles it.

  // Setup routes with Slack verification middleware.
  const routes = createRoutes(secretManager, slackVerification);

  app.use(routes);

  return app;
}
