import express from "express";

import { createRoutes } from "./routes.js";
import { SecretManager } from "./secrets.js";

/**
 * Creates and configures the Express application
 */
export async function createApp(): Promise<express.Application> {
  // Initialize dependencies.
  const secretManager = new SecretManager();

  // Create Express app.
  const app = express();
  // No body parsing middleware needed - verification middlewares handle it.

  // Setup routes with verification middlewares.
  const routes = createRoutes(secretManager);

  app.use(routes);

  return app;
}
