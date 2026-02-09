import crypto from "crypto";
import type { Request, RequestHandler } from "express";
import rawBody from "raw-body";
import type { SecretManager } from "./secrets.js";

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
  requestTimestamp: string | undefined;
  signature: string | undefined;
  signingSecret: string;
}): void {
  if (signature === undefined || requestTimestamp === undefined) {
    throw new ReceiverAuthenticityError(
      "Slack request signing verification failed. Some headers are missing."
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

// On Firebase Functions and GCP, req.rawBody is provided for signature verification
async function parseExpressRequestRawBody(req: Request): Promise<string> {
  if (req !== null && "rawBody" in req && req.rawBody) {
    return Promise.resolve(req.rawBody.toString());
  }

  return (await rawBody(req)).toString();
}

// Creates middleware that verifies both webhook secret and Slack signature.
export function createSlackVerificationMiddleware(
  secretManager: SecretManager
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      // Verify webhook secret first (fast check).
      const { webhookSecret } = req.params;
      if (!webhookSecret) {
        res.status(404).send("Not found");
        return;
      }

      const secrets = await secretManager.getSecrets();
      if (webhookSecret !== secrets.webhookSecret) {
        console.error("Invalid webhook secret provided", {
          component: "slack-verification",
        });
        res.status(404).send("Not found");
        return;
      }

      // Get the raw body for Slack signature verification.
      const stringBody = await parseExpressRequestRawBody(req);

      // Verify Slack signature.
      const {
        "x-slack-signature": signature,
        "x-slack-request-timestamp": requestTimestamp,
      } = req.headers;

      if (
        typeof signature !== "string" ||
        typeof requestTimestamp !== "string"
      ) {
        throw new ReceiverAuthenticityError(
          "Slack request signing verification failed. Some headers are invalid."
        );
      }

      verifyRequestSignature({
        body: stringBody,
        requestTimestamp,
        signature,
        signingSecret: secrets.slackSigningSecret,
      });

      // For form-encoded (interactions), keep raw string to preserve payload field.
      // For JSON (events), parse it so routes can access the object.
      const contentType = req.headers["content-type"];
      if (contentType === "application/x-www-form-urlencoded") {
        req.body = stringBody; // Keep raw for interactions.
      } else {
        req.body = JSON.parse(stringBody); // Parse for events.
      }

      next();
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
