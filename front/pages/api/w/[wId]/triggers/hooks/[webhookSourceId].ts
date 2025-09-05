import * as crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import { promisify } from "util";

import { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
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

function getClientIP(req: NextApiRequest): string {
  // Try to get the real IP from various headers
  const forwarded = req.headers["x-forwarded-for"] as string;
  const realIP = req.headers["x-real-ip"] as string;
  const cfConnectingIP = req.headers["cf-connecting-ip"] as string;

  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, use the first one
    return forwarded.split(",")[0].trim();
  }
  if (realIP) {
    return realIP;
  }
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback to connection remote address
  return req.socket.remoteAddress || "unknown";
}

function verifySignature(
  payload: Buffer,
  signature: string,
  secret: string,
  algorithm: "sha1" | "sha256" | "sha512"
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest("hex");

    // Handle prefixed signatures (e.g., "sha256=...")
    const cleanSignature = signature.startsWith(`${algorithm}=`)
      ? signature.slice(algorithm.length + 1)
      : signature;

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
      // Collect raw body using stream pipeline
      let rawBody = Buffer.from("");
      const collector = new Writable({
        write(chunk, encoding, callback) {
          rawBody = Buffer.concat([rawBody, chunk]);
          callback();
        },
      });

      try {
        await promisify(pipeline)(req, collector);
      } catch (error) {
        logger.error(
          { error, webhookSourceId },
          "[Webhook] Error reading request body"
        );
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Error reading request body.",
          },
        });
      }

      // Get workspace first to validate it exists
      const workspace = await WorkspaceResource.fetchByModelId(wId);
      if (!workspace) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "workspace_not_found",
            message: "Workspace not found.",
          },
        });
      }

      // Create internal authenticator for workspace to use resource methods
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Fetch webhook source using resource
      const webhookSource = await WebhookSourceResource.fetchById(
        auth,
        webhookSourceId
      );

      if (!webhookSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "app_not_found",
            message: "Webhook source not found.",
          },
        });
      }

      const clientIP = getClientIP(req);

      // Verify IP allowlist if configured
      if (webhookSource.allowedIPs.length > 0) {
        const isIPAllowed = webhookSource.allowedIPs.includes(clientIP);
        if (!isIPAllowed) {
          logger.warn(
            {
              webhookSourceId,
              clientIP,
              allowedIPs: webhookSource.allowedIPs,
            },
            "[Webhook] Request from unauthorized IP"
          );
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: "Request from unauthorized IP address.",
            },
          });
        }
      }

      // Verify signature if configured
      if (webhookSource.secret && webhookSource.signatureAlgorithm) {
        const signatureHeader =
          webhookSource.signatureHeader || "x-hub-signature-256";
        const signature = req.headers[signatureHeader.toLowerCase()] as string;

        if (!signature) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: `Missing signature header: ${signatureHeader}`,
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
              signatureHeader,
              clientIP,
            },
            "[Webhook] Invalid signature"
          );
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "app_auth_error",
              message: "Invalid webhook signature.",
            },
          });
        }
      }

      // Parse the payload
      let payload: any;
      const contentType = req.headers["content-type"] || "";

      try {
        if (contentType.includes("application/json")) {
          payload = JSON.parse(rawBody.toString());
        } else if (contentType.includes("application/x-www-form-urlencoded")) {
          payload = Object.fromEntries(new URLSearchParams(rawBody.toString()));
        } else {
          // Store as raw text for other content types
          payload = rawBody.toString();
        }
      } catch (error) {
        logger.error(
          { error, webhookSourceId, contentType },
          "[Webhook] Error parsing payload"
        );
        payload = rawBody.toString(); // Fallback to raw string
      }

      // Log the webhook payload
      logger.info(
        {
          webhookSourceId,
          webhookSourceName: webhookSource.name,
          workspaceId: workspace.sId,
          clientIP,
          contentType,
          payloadSize: rawBody.length,
          headers: {
            "user-agent": req.headers["user-agent"],
            "content-type": req.headers["content-type"],
            ...Object.fromEntries(
              Object.entries(req.headers).filter(
                ([key]) =>
                  webhookSource.customHeaders &&
                  key in webhookSource.customHeaders
              )
            ),
          },
          payload:
            typeof payload === "string" && payload.length > 1000
              ? `${payload.substring(0, 1000)}...`
              : payload,
        },
        "[Webhook] Received webhook payload"
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
