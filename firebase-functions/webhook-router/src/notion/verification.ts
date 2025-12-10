import crypto from "crypto";
import type { Request, RequestHandler } from "express";
import type express from "express";
import { error } from "firebase-functions/logger";
import rawBody from "raw-body";

import type { SecretManager } from "../secrets.js";
import type { WebhookRouterConfigManager } from "../webhook-router-config.js";
import type { Region } from "../webhook-router-config.js";
import { ALL_REGIONS } from "../webhook-router-config.js";

class ReceiverAuthenticityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiverAuthenticityError";
  }
}

function verifyRequestSignature({
  body,
  signature,
  signingSecret,
}: {
  body: string;
  signature: string | undefined;
  signingSecret: string;
}): void {
  if (signature === undefined) {
    throw new ReceiverAuthenticityError(
      "Notion request signing verification failed. Signature header is missing."
    );
  }

  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(body);

  // Use crypto.timingSafeEqual for timing-safe comparison.
  const expectedHash = hmac.digest("hex");

  if (signature.length !== expectedHash.length) {
    throw new ReceiverAuthenticityError(
      "Notion request signing verification failed. Signature mismatch."
    );
  }

  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  if (!crypto.timingSafeEqual(signatureBuffer, expectedHashBuffer)) {
    throw new ReceiverAuthenticityError(
      "Notion request signing verification failed. Signature mismatch."
    );
  }
}

// On Firebase Functions and GCP, req.rawBody is provided for signature verification.
async function parseExpressRequestRawBody(req: Request): Promise<string> {
  if (req !== null && "rawBody" in req && req.rawBody) {
    return Promise.resolve(req.rawBody.toString());
  }

  return (await rawBody(req)).toString();
}

// Creates middleware that verifies Notion signature.
export function createNotionVerificationMiddleware(
  secretManager: SecretManager,
  webhookRouterConfigManager: WebhookRouterConfigManager,
  { useClientCredentials }: { useClientCredentials: boolean }
): RequestHandler {
  return async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ): Promise<void> => {
    let providerWorkspaceId: string | undefined;
    let connectorIdsByRegion: Record<string, number[]> | undefined;

    try {
      // Get the raw body for Notion signature verification.
      const stringBody = await parseExpressRequestRawBody(req);

      // Parse body as JSON for routes to access the object.
      req.body = JSON.parse(stringBody);

      // Skip signature verification for the initial verification_token request, since
      // that is what gives us the signing secret in the first place. This applies to
      // both private client integrations and standard Dust integrations.
      if (req.body.verification_token) {
        return next();
      }

      // Verify Notion signature.
      // Even though it's documented as "X-Notion-Signature", the actual header name is lowercase in practice.
      const signature = req.headers["x-notion-signature"];

      // The signature header from Notion includes the "sha256=" prefix.
      const signaturePrefix = "sha256=";
      if (
        typeof signature !== "string" ||
        !signature.startsWith(signaturePrefix)
      ) {
        throw new ReceiverAuthenticityError(
          "Notion request signing verification failed. Signature header is invalid."
        );
      }

      let signingSecret: string;
      if (useClientCredentials) {
        // It's a private client integration, so get the signing secret and regions from
        // the webhook router config.
        providerWorkspaceId = req.params.providerWorkspaceId;
        const notionWebhookConfig = await webhookRouterConfigManager.getEntry(
          "notion",
          providerWorkspaceId
        );
        // Set the regions for the forwarder
        req.regions = Object.keys(notionWebhookConfig.regions).filter(
          (key): key is Region => ALL_REGIONS.includes(key as Region)
        );
        // Extract connectorIds by region for potential error logging
        connectorIdsByRegion = notionWebhookConfig.regions;
        signingSecret = notionWebhookConfig.signingSecret;
      } else {
        // Get secrets for Notion signature verification (webhook secret already validated)
        const secrets = await secretManager.getSecrets();
        signingSecret = secrets.notionSigningSecret;
      }

      verifyRequestSignature({
        body: stringBody,
        signature: signature.slice(signaturePrefix.length),
        signingSecret: signingSecret,
      });

      return next();
    } catch (e) {
      if (e instanceof ReceiverAuthenticityError) {
        error("Notion request verification failed", {
          component: "notion-verification",
          error: e.message,
          ...(providerWorkspaceId && { providerWorkspaceId }),
          ...(connectorIdsByRegion && { connectorIdsByRegion }),
        });
        res.status(401).send();
        return;
      }

      error("Notion request verification failed", {
        component: "notion-verification",
        error: e instanceof Error ? e.message : String(e),
        ...(providerWorkspaceId && { providerWorkspaceId }),
        ...(connectorIdsByRegion && { connectorIdsByRegion }),
      });
      res.status(400).send();
      return;
    }
  };
}
