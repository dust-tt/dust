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

// Synchronizes GCS config file update with cache
export const syncWebhookRouterConfig = onObjectFinalized({ bucket, serviceAccount }, async (event) => {
  const { name: filePath, bucket: fileBucket } = event.data;

  if (filePath !== CONFIG.DUST_WEBHOOK_ROUTER_CONFIG_FILE_PATH) {
    // Ignore other files updates
    return;
  }

  try {
    const file = new Storage().bucket(fileBucket).file(filePath);
    const [contents] = await file.download();

    const parsed = JSON.parse(contents.toString("utf-8"));
    if (typeof parsed !== "object") {
      throw new Error("Invalid webhook configuration format. Expected an object.");
    }

    await getDatabase(firebaseApp).ref().set(parsed);

    console.log("Webhook router configuration sync succeeded", { component: "webhook-router-config-sync" });
  } catch (error) {
    console.error("Webhook router configuration sync failed", {
      component: "webhook-router-config-sync",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

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
    const app = await createApp();
    app(req, res);
  }
);
