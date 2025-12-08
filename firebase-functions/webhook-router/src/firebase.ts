import { Storage } from "@google-cloud/storage";
import { initializeApp } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { defineString } from "firebase-functions/params";
import { onObjectFinalized } from "firebase-functions/storage";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";

import { createApp } from "./app.js";
import { CONFIG } from "./config.js";

const serviceAccount = defineString("SERVICE_ACCOUNT");
const bucket = defineString("GCP_WEBHOOK_ROUTER_CONFIG_BUCKET");

// Set global options for all functions.
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "512MiB",
  timeoutSeconds: 300,
});

const firebaseApp = initializeApp();
const app = createApp(firebaseApp);

// Synchronizes GCS config file update with cache
export const syncWebhookRouterConfig = onObjectFinalized(
  { bucket, serviceAccount },
  async (event) => {
    const {
      name: webhookRouterConfigFilePath,
      bucket: webhookRouterConfigBucket,
    } = event.data;

    if (
      webhookRouterConfigFilePath !==
      CONFIG.DUST_WEBHOOK_ROUTER_CONFIG_FILE_PATH
    ) {
      // Ignore other files updates
      return;
    }

    try {
      const webhookRouterConfigFile = new Storage()
        .bucket(webhookRouterConfigBucket)
        .file(webhookRouterConfigFilePath);
      const [rawConfig] = await webhookRouterConfigFile.download();

      const parsedConfig = JSON.parse(rawConfig.toString("utf-8"));
      if (parsedConfig === null || typeof parsedConfig !== "object") {
        throw new Error(
          "Invalid webhook configuration format. Expected an object."
        );
      }

      // We set the updated webhook router configuration at the root of Firebase Realtime Database
      await getDatabase(firebaseApp).ref().set(parsedConfig);

      console.log("Webhook router configuration sync succeeded", {
        component: "webhook-router-config-sync",
      });
    } catch (error) {
      console.error("Webhook router configuration sync failed", {
        component: "webhook-router-config-sync",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);

// Create and export the Firebase Function.
export const webhookRouter = onRequest(
  {
    // Function-specific options.
    cors: false, // We'll handle CORS in Express if needed.
    invoker: "public",
    minInstances: 1,
    serviceAccount,
  },
  async (req, res) => {
    // Firebase automatically provides req.rawBody for signature verification.
    app(req, res);
  }
);
