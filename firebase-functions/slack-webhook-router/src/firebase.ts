import { defineString } from "firebase-functions/params";
import { setGlobalOptions } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "./app.js";

const serviceAccount = defineString("SERVICE_ACCOUNT");

// Set global options for all functions.
setGlobalOptions({
  region: "us-central1",
  maxInstances: 10,
  memory: "512MiB",
  timeoutSeconds: 300,
});

// Create and export the Firebase Function.
export const slackWebhookRouter = onRequest(
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
