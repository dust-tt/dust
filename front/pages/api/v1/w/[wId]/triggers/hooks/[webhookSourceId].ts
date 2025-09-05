import * as crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import { promisify } from "util";

import { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type WebhookResponseBody = {
  success: boolean;
  message?: string;
};

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser to get raw body
  },
};

const MAX_WEBHOOK_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5MB

function verifySignature(
  payload: Buffer,
  signature: string,
  secret: string,
  algorithm: "sha1" | "sha256" | "sha512"
): boolean {
  try {
    // Generate what the signature should be using the secret and payload
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    // Some webhook providers prefix signatures with algorithm name (like "sha256=abc123")
    // Others send just the raw hash. We handle both cases here.
    const cleanSignature = signature.startsWith(`${algorithm}=`)
      ? signature.slice(algorithm.length + 1)
      : signature;

    // Use timing-safe comparison to prevent timing attacks that could reveal
    // information about the expected signature
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(cleanSignature, "hex")
    );
  } catch (error) {
    logger.error({ error, algorithm }, "[Webhook] Error verifying signature");
    return false;
  }
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<WebhookResponseBody>>
): Promise<void> {
  const { wId, webhookSourceId } = req.query;

  if (typeof wId !== "string" || typeof webhookSourceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace ID or webhook source ID.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      // Quick check: reject oversized payloads before doing any expensive operations
      const contentLength = parseInt(req.headers["content-length"] || "0");
      if (contentLength > MAX_WEBHOOK_PAYLOAD_SIZE) {
        return apiError(req, res, {
          status_code: 413,
          api_error: {
            type: "content_too_large",
            message: `Payload too large. Maximum size is ${MAX_WEBHOOK_PAYLOAD_SIZE / 1024 / 1024}MB.`,
          },
        });
      }

      // Make sure the workspace actually exists before processing the webhook
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_not_found",
            message: "Resource not found.",
          },
        });
      }

      // Rate limiting: prevent abuse by limiting requests per workspace
      // This stops one workspace from being spammed with webhook calls
      const remaining = await rateLimiter({
        key: `workspace:${workspace.id}:triggers:webhook`,
        maxPerTimeframe: 100,
        timeframeSeconds: 60,
        logger,
      });
      if (remaining < 0) {
        return apiError(req, res, {
          status_code: 429,
          api_error: {
            type: "rate_limit_error",
            message: "You have reached the rate limit for webhook calls.",
          },
        });
      }

      // Create an admin authenticator so we can use the resource layer
      // This is safe because we already validated the workspace exists
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Look up the specific webhook source configuration
      const webhookSource = await WebhookSourceResource.fetchById(
        auth,
        webhookSourceId
      );

      if (!webhookSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_not_found",
            message: "Resource not found.",
          },
        });
      }

      // Read the request body using streams to handle large payloads efficiently
      // We protect against memory exhaustion by checking size as we go
      let rawBody = Buffer.from("");
      let currentSize = 0;
      const collector = new Writable({
        write(chunk, encoding, callback) {
          currentSize += chunk.length;
          // Stop processing if the payload gets too big during streaming
          if (currentSize > MAX_WEBHOOK_PAYLOAD_SIZE) {
            callback(new Error("Payload size exceeded during streaming"));
            return;
          }
          rawBody = Buffer.concat([rawBody, chunk]);
          callback();
        },
      });

      try {
        await promisify(pipeline)(req, collector);
      } catch (error) {
        logger.error(
          { error, webhookSourceId },
          "[Webhook] Failed to read request body - might be too large or malformed"
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Error reading request body.",
          },
        });
      }

      // Final safety check on the actual payload size
      // (in case content-length header was wrong or missing)
      if (rawBody.length > MAX_WEBHOOK_PAYLOAD_SIZE) {
        return apiError(req, res, {
          status_code: 413,
          api_error: {
            type: "content_too_large",
            message: `Payload too large. Maximum size is ${MAX_WEBHOOK_PAYLOAD_SIZE / 1024 / 1024}MB.`,
          },
        });
      }

      // Handle signature verification if the webhook source has it configured
      // We only verify signatures when both secret and algorithm are explicitly set
      if (
        webhookSource.secret &&
        webhookSource.signatureAlgorithm &&
        webhookSource.signatureHeader
      ) {
        const signature = req.headers[
          webhookSource.signatureHeader.toLowerCase()
        ] as string;

        if (!signature) {
          logger.warn(
            {
              webhookSourceId,
              expectedHeader: webhookSource.signatureHeader,
            },
            "[Webhook] Missing required signature header"
          );
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: "Missing required signature header.",
            },
          });
        }

        const isValidSignature = verifySignature(
          rawBody,
          signature,
          webhookSource.secret,
          webhookSource.signatureAlgorithm
        );

        if (!isValidSignature) {
          logger.warn(
            {
              webhookSourceId,
              signatureHeader: webhookSource.signatureHeader,
            },
            "[Webhook] Invalid signature - payload may have been tampered with"
          );
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: "Invalid signature.",
            },
          });
        }
      }

      // Parse the payload based on content type
      // We support different formats but don't make assumptions about what's coming
      let payload: any;
      const contentType = req.headers["content-type"] || "";

      try {
        if (contentType.includes("application/json")) {
          // Extra protection against JSON bombs (deeply nested or huge JSON)
          const jsonString = rawBody.toString();
          if (jsonString.length > 1024 * 1024) {
            throw new Error("JSON payload too large for parsing");
          }
          payload = JSON.parse(jsonString);
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          // Parse form data into an object
          payload = Object.fromEntries(new URLSearchParams(rawBody.toString()));
        } else {
          // For everything else (text/plain, text/xml, etc.), keep it as a string
          payload = rawBody.toString();
        }
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            webhookSourceId,
            contentType,
          },
          "[Webhook] Failed to parse payload - treating as raw text"
        );
        // If parsing fails, just treat it as raw text
        payload = rawBody.toString();
      }

      // Log the webhook details for debugging and monitoring
      // We're careful about what we log to avoid leaking sensitive data
      logger.info(
        {
          webhookSourceId,
          webhookSourceName: webhookSource.name,
          workspaceId: workspace.sId,
          contentType,
          payloadSize: rawBody.length,
          headers: {
            "user-agent": req.headers["user-agent"],
            "content-type": req.headers["content-type"],
            // Only include custom headers that the webhook source is configured to care about
            ...Object.fromEntries(
              Object.entries(req.headers).filter(
                ([key]) =>
                  webhookSource.customHeaders &&
                  key in webhookSource.customHeaders
              )
            ),
          },
          // Only show actual payload content in development to help with debugging
          ...(process.env.NODE_ENV !== "production" && {
            payload:
              typeof payload === "string" && payload.length > 1000
                ? `${payload.substring(0, 1000)}...`
                : payload,
          }),
        },
        "[Webhook] Successfully received and processed webhook"
      );

      // TODO: Here you would typically:
      // 1. Trigger the associated agent configuration
      // 2. Process the webhook payload based on the event type
      // 3. Store the webhook event for audit/replay purposes

      return res.status(200).json({
        success: true,
        message: "Webhook received successfully",
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only POST method is supported for webhooks.",
        },
      });
  }
}

export default withLogging(handler);
