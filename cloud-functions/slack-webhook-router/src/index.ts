import express from "express";

import { CONFIG } from "./config.js";
import { createRoutes } from "./routes.js";
import { SecretManager } from "./secrets.js";
import { GracefulServer } from "./server.js";
import { createSlackVerificationMiddleware } from "./slack-verification.js";

async function main(): Promise<void> {
  try {
    // Initialize dependencies.
    const secretManager = new SecretManager();

    // Create Express app.
    const app = express();

    // Start server.
    const server = app.listen(CONFIG.PORT, async () => {
      try {
        // Ensure secrets are loaded before accepting traffic.
        await secretManager.getSecrets();

        console.log("Slack webhook router ready", {
          component: "main",
          port: CONFIG.PORT,
        });
      } catch (error) {
        console.error("Failed to start server", {
          component: "main",
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    });

    // Create Slack verification middleware
    const slackVerification = createSlackVerificationMiddleware(secretManager);

    // Setup graceful shutdown.
    const gracefulServer = new GracefulServer(server);

    // Setup routes with Slack verification middleware.
    const routes = createRoutes(
      secretManager,
      gracefulServer,
      slackVerification
    );

    app.use(routes);

    // Cleanup on exit.
    process.on("exit", () => {
      secretManager.dispose();
      gracefulServer.dispose();
    });

    console.log("Server initialized successfully", { component: "main" });
  } catch (error) {
    console.error("Failed to initialize server", {
      component: "main",
      error: error instanceof Error ? error.message : String(error),
    });

    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error in main", {
    component: "main",
    error: error instanceof Error ? error.message : String(error),
  });

  process.exit(1);
});
