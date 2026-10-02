import crypto from "crypto";
import type { Request, RequestHandler } from "express";
import { error, log } from "firebase-functions/logger";
import rawBody from "raw-body";
import { z } from "zod";

import type { SecretManager } from "../secrets.js";
import type { WebhookRouterConfigManager } from "../webhook-router-config.js";
import { ALL_CELLS } from "../webhook-router-config.js";

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

const SlackInteractionPayloadTeamSchema = z.object({
  team: z.object({ id: z.string() }),
});

function parseSlackTeamIdFromPayload(payload: string): string | undefined {
  const parsed = SlackInteractionPayloadTeamSchema.safeParse(
    JSON.parse(payload)
  );
  return parsed.success ? parsed.data.team.id : undefined;
}

/**
 * @cc [owner:tdraier,label:security] signing-team-matches-forwarded-team
 * The team whose signing secret verifies the request MUST be the team connectors resolves the
 * connector from: `payload.team.id` when the body carries a `payload` field (interactions),
 * `team_id` otherwise (events). A body carrying both fields MUST be rejected, and a form-encoded
 * body carrying any field other than a single `payload` MUST be rejected.
 */
function getSlackTeamId(body: Record<string, unknown>): string | undefined {
  const { payload, team_id: teamId } = body;
  if (payload !== undefined && teamId !== undefined) {
    return undefined;
  }
  if (typeof payload === "string") {
    return parseSlackTeamIdFromPayload(payload);
  }
  return typeof teamId === "string" ? teamId : undefined;
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
    let teamId: string | undefined;
    let connectorIdsByCell: Record<string, number[]> | undefined;

    try {
      if (isUrlVerification(req.body)) {
        log("Handling URL verification challenge", {
          component: "slack-verification",
          endpoint: req.path,
        });
        res.status(200).json({ challenge: req.body.challenge });
        return;
      }

      const rawBody = await parseExpressRequestRawBody(req);

      const isUrlEncoded =
        req.headers["content-type"] === "application/x-www-form-urlencoded";
      const formFields = isUrlEncoded ? new URLSearchParams(rawBody) : null;
      const bodyFields: Record<string, unknown> = formFields
        ? Object.fromEntries(formFields)
        : req.body;

      // Functions-framework parses body as json by default, keep raw for interactions.
      if (isUrlEncoded) {
        req.body = rawBody;
      }

      let signingSecret: string;

      if (useClientCredentials) {
        // Connectors decodes forms with `qs`, which reads aliases such as `payload[]` as `payload`.
        if (formFields && [...formFields.keys()].join() !== "payload") {
          throw new ReceiverAuthenticityError(
            "Slack request signing verification failed. Unexpected form fields."
          );
        }

        teamId = getSlackTeamId(bodyFields);
        if (!teamId) {
          throw new ReceiverAuthenticityError(
            "Slack request signing verification failed. Some data in the payload is invalid."
          );
        }

        const slackWebhookConfig = await webhookRouterConfigManager.getEntry(
          "slack",
          teamId
        );
        // Set the cells for the forwarder
        req.cells = ALL_CELLS.filter(
          (cell) => cell in slackWebhookConfig.cells
        );
        // Extract connectorIds by cell for potential error logging
        connectorIdsByCell = slackWebhookConfig.cells;
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
    } catch (e) {
      if (e instanceof ReceiverAuthenticityError) {
        error("Slack request verification failed", {
          component: "slack-verification",
          error: e.message,
          ...(teamId && { teamId }),
          ...(connectorIdsByCell && { connectorIdsByCell }),
        });
        res.status(401).send();
        return;
      }

      error("Slack request verification failed", {
        component: "slack-verification",
        error: e instanceof Error ? e.message : String(e),
        ...(teamId && { teamId }),
        ...(connectorIdsByCell && { connectorIdsByCell }),
      });
      res.status(400).send();
      return;
    }
  };
}
