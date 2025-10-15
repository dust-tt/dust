import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type DeleteWebhookSourceResponseBody = {
  success: true;
};

export type PatchWebhookSourceResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      DeleteWebhookSourceResponseBody | PatchWebhookSourceResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { webhookSourceId } = req.query;
  if (typeof webhookSourceId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid webhook source ID.",
      },
    });
  }

  const { method } = req;

  switch (method) {
    case "PATCH": {
      const { remoteWebhookId, remoteWebhookData, remoteConnectionId } =
        req.body;

      try {
        const webhookSourceResource = await WebhookSourceResource.fetchById(
          auth,
          webhookSourceId
        );

        if (!webhookSourceResource) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "webhook_source_not_found",
              message:
                "The webhook source you're trying to update was not found.",
            },
          });
        }

        // Build updates object with only provided fields
        const updates: {
          remoteWebhookId?: string;
          remoteWebhookData?: Record<string, string>;
          remoteConnectionId?: string;
        } = {};

        if (remoteWebhookId && typeof remoteWebhookId === "string") {
          updates.remoteWebhookId = remoteWebhookId;
        }
        if (remoteWebhookData && typeof remoteWebhookData === "object") {
          updates.remoteWebhookData = remoteWebhookData;
        }
        if (remoteConnectionId && typeof remoteConnectionId === "string") {
          updates.remoteConnectionId = remoteConnectionId;
        }

        // Update the webhook source with the provided fields
        await webhookSourceResource.updateRemoteWebhookMetadata(updates);

        return res.status(200).json({
          success: true,
        });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to update webhook source.",
          },
        });
      }
    }

    case "DELETE": {
      try {
        const webhookSourceResource = await WebhookSourceResource.fetchById(
          auth,
          webhookSourceId
        );

        if (!webhookSourceResource) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "webhook_source_not_found",
              message:
                "The webhook source you're trying to delete was not found.",
            },
          });
        }

        // If this webhook has remote metadata and the kind supports remote deletion, try to delete it from the provider
        const supportedKinds = ["github"];
        if (
          supportedKinds.includes(webhookSourceResource.kind) &&
          webhookSourceResource.remoteWebhookId &&
          webhookSourceResource.remoteWebhookData &&
          webhookSourceResource.remoteConnectionId
        ) {
          try {
            await fetch(
              `${req.headers.origin ?? ""}/api/w/${auth.workspace()?.sId}/oauth/${webhookSourceResource.kind}/webhooks`,
              {
                method: "DELETE",
                headers: {
                  "Content-Type": "application/json",
                  Cookie: req.headers.cookie ?? "",
                },
                body: JSON.stringify({
                  connectionId: webhookSourceResource.remoteConnectionId,
                  remoteWebhookData: webhookSourceResource.remoteWebhookData,
                  webhookId: webhookSourceResource.remoteWebhookId,
                }),
              }
            );
          } catch (error: any) {
            logger.error(
              `Failed to delete remote webhook on ${webhookSourceResource.kind}`,
              error instanceof Error ? error.message : error
            );
            // Continue with local deletion even if remote deletion fails
          }
        }

        const deleteResult = await webhookSourceResource.delete(auth);
        if (deleteResult.isErr()) {
          throw deleteResult.error;
        }

        return res.status(200).json({
          success: true,
        });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete webhook source.",
          },
        });
      }
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
