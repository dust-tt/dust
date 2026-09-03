import express from "express";
import { error } from "firebase-functions/logger";

import { WebhookForwarder } from "../forwarder.js";
import type { SecretManager } from "../secrets.js";
import type { WebhookRouterConfigManager } from "../webhook-router-config.js";
import { ALL_REGIONS } from "../webhook-router-config.js";
import { createNotionVerificationMiddleware } from "./verification.js";

export function createNotionRoutes(
  secretManager: SecretManager,
  webhookRouterConfigManager: WebhookRouterConfigManager,
  useClientCredentials: boolean
) {
  const router = express.Router({ mergeParams: true });
  const notionVerification = createNotionVerificationMiddleware(
    secretManager,
    webhookRouterConfigManager,
    { useClientCredentials }
  );

  // Notion webhook endpoint with Notion verification only (webhook secret already validated)
  router.post("/", notionVerification, async (req, res) => {
    await handleNotionWebhook(
      req,
      res,
      "notion",
      secretManager,
      useClientCredentials
    );
  });

  return router;
}

async function handleNotionWebhook(
  req: express.Request,
  res: express.Response,
  endpoint: string,
  secretManager: SecretManager,
  useClientCredentials: boolean
): Promise<void> {
  const isSigningSecretRegistration =
    useClientCredentials && Boolean(req.body.verification_token);

  try {
    if (!isSigningSecretRegistration) {
      // Respond immediately to ordinary Notion webhook events.
      res.status(200).send();
    }

    // Get secrets for forwarding (already validated by middleware).
    const secrets = await secretManager.getSecrets();

    let body;
    let rootUrlToken;
    const { providerWorkspaceId } = req.params;
    if (isSigningSecretRegistration) {
      // Scenario where user has their own Notion integration, and this is the
      // initial webhook registration request that gives us the signing secret.
      // We send it to the connectors API that saves webhook router entries.
      body = {
        registrationToken: req.params.registrationToken,
        signingSecret: req.body.verification_token,
      };
      endpoint = `notion/${providerWorkspaceId}/registration`;
      rootUrlToken = "webhooks_router_entries";
    } else {
      // In all other cases, we forward the original body to connectors.
      body = req.body;
      rootUrlToken = "webhooks";
    }

    // Forward to regions asynchronously.
    const results = await new WebhookForwarder(secrets).forwardToRegions({
      body,
      endpoint,
      headers: req.headers,
      method: req.method,
      regions: req.regions ?? ALL_REGIONS,
      rootUrlToken,
      providerWorkspaceId,
    });

    if (isSigningSecretRegistration) {
      const succeeded = results.some(
        (result) => result.status === "fulfilled" && result.value.ok
      );
      res.status(succeeded ? 200 : 401).send();
    }
  } catch (e) {
    error("Notion webhook router error", {
      component: "notion-routes",
      endpoint,
      error: e instanceof Error ? e.message : String(e),
    });

    if (!res.headersSent) {
      res.status(isSigningSecretRegistration ? 500 : 200).send();
    }
  }
}
