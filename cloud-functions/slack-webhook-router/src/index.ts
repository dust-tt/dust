import express from "express";
import { CONFIG } from "./config.js";
import { createRoutes } from "./routes.js";
import { SecretManager } from "./secrets.js";
import { GracefulServer } from "./server.js";

async function main(): Promise<void> {
  try {
    // Initialize dependencies.
    const secretManager = new SecretManager();

    // Create Express app.
    const app = express();
    app.use(express.json({ limit: CONFIG.REQUEST_SIZE_LIMIT }));
    app.use(express.urlencoded({ extended: true, limit: CONFIG.REQUEST_SIZE_LIMIT }));

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

    // Setup graceful shutdown.
    const gracefulServer = new GracefulServer(server);

    // Cleanup on exit.
    process.on("exit", () => {
      secretManager.dispose();
      gracefulServer.dispose();
    });

    // Setup routes.
    const routes = createRoutes(secretManager, gracefulServer);
    app.use(routes);

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
