import crypto from "crypto";
import type { Request, RequestHandler } from "express";
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
  requestTimestamp,
  signature,
  signingSecret,
}: {
  body: string;
  requestTimestamp: string | string[] | undefined;
  signature: string | string[] | undefined;
  signingSecret: string;
}): void {
  if (typeof signature !== "string" || typeof requestTimestamp !== "string") {
    throw new ReceiverAuthenticityError(
      "Slack request signing verification failed. Some headers are invalid."
    );
  }

  const ts = Number(requestTimestamp);
  if (Number.isNaN(ts)) {
    throw new ReceiverAuthenticityError(
      "Slack request signing verification failed. Timestamp is invalid."
    );
  }

  // Divide current date to match Slack ts format.
  // Subtract 5 minutes from current time.
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;

  if (ts < fiveMinutesAgo) {
    throw new ReceiverAuthenticityError(
      "Slack request signing verification failed. Timestamp is too old."
    );
  }

  const hmac = crypto.createHmac("sha256", signingSecret);
  const [version, hash] = signature.split("=");
  hmac.update(`${version}:${ts}:${body}`);

  // Use crypto.timingSafeEqual for timing-safe comparison.
  const expectedHash = hmac.digest("hex");
  if (hash.length !== expectedHash.length) {
    throw new ReceiverAuthenticityError(
      "Slack request signing verification failed. Signature mismatch."
    );
  }

  const hashBuffer = Buffer.from(hash, "hex");
  const expectedHashBuffer = Buffer.from(expectedHash, "hex");

  if (!crypto.timingSafeEqual(hashBuffer, expectedHashBuffer)) {
    throw new ReceiverAuthenticityError(
      "Slack request signing verification failed. Signature mismatch."
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

function isUrlVerification(body: any): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    body.type === "url_verification" &&
    "challenge" in body
  );
}

export function createSlackVerificationMiddleware(
  secretManager: SecretManager,
  webhookRouterConfigManager: WebhookRouterConfigManager,
  { useClientCredentials }: { useClientCredentials: boolean }
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      if (isUrlVerification(req.body)) {
        console.log("Handling URL verification challenge", {
          component: "slack-verification",
          endpoint: req.path,
        });
        res.status(200).json({ challenge: req.body.challenge });
        return;
      }

      const rawBody = await parseExpressRequestRawBody(req);

      // Functions-framework parses body as json by default, keep raw for interactions.
      if (req.headers["content-type"] === "application/x-www-form-urlencoded") {
        req.body = rawBody;
      }

      let signingSecret: string;

      if (useClientCredentials) {
        const teamId = req.body.team_id;
        if (!teamId) {
          throw new ReceiverAuthenticityError(
            "Slack request signing verification failed. Some data in the payload is invalid."
          );
        }

        const slackWebhookConfig = await webhookRouterConfigManager.getEntry(
          "slack",
          teamId
        );
        // Set the regions for the forwarder
        req.regions = Object.keys(slackWebhookConfig.regions).filter(
          (key): key is Region => ALL_REGIONS.includes(key as Region)
        );
        signingSecret = slackWebhookConfig.signingSecret;
      } else {
        const secrets = await secretManager.getSecrets();
        signingSecret = secrets.slackSigningSecret;
      }

      verifyRequestSignature({
        body: rawBody,
        requestTimestamp: req.headers["x-slack-request-timestamp"],
        signature: req.headers["x-slack-signature"],
        signingSecret,
      });

      return next();
    } catch (error) {
      if (error instanceof ReceiverAuthenticityError) {
        console.error("Slack request verification failed", {
          component: "slack-verification",
          error: error.message,
        });
        res.status(401).send();
        return;
      }

      console.error("Slack request verification failed", {
        component: "slack-verification",
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(400).send();
      return;
    }
  };
}
