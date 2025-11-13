import crypto from "crypto";
import type { Request, RequestHandler } from "express";
import rawBody from "raw-body";

import type { SecretManager } from "../secrets.js";

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
  secretManager: SecretManager
): RequestHandler {
  return async (req, res, next): Promise<void> => {
    try {
      // Get secrets for Notion signature verification (webhook secret already validated)
      const secrets = await secretManager.getSecrets();

      // Get the raw body for Notion signature verification.
      const stringBody = await parseExpressRequestRawBody(req);

      // Verify Notion signature.
      const signature = req.headers["X-Notion-Signature"];

      if (typeof signature !== "string") {
        throw new ReceiverAuthenticityError(
          "Notion request signing verification failed. Signature header is invalid."
        );
      }

      verifyRequestSignature({
        body: stringBody,
        signature,
        signingSecret: secrets.notionSigningSecret,
      });

      // Parse body as JSON for routes to access the object.
      req.body = JSON.parse(stringBody);

      return next();
    } catch (error) {
      if (error instanceof ReceiverAuthenticityError) {
        console.error("Notion request verification failed", {
          component: "notion-verification",
          error: error.message,
        });
        res.status(401).send();
        return;
      }

      console.error("Notion request verification failed", {
        component: "notion-verification",
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(400).send();
      return;
    }
  };
}
