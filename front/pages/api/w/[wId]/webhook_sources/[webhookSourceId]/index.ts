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
      const { remoteMetadata, oauthConnectionId } = req.body;

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
          remoteMetadata?: Record<string, any>;
          oauthConnectionId?: string;
        } = {};

        if (remoteMetadata && typeof remoteMetadata === "object") {
          updates.remoteMetadata = remoteMetadata;
        }
        if (oauthConnectionId && typeof oauthConnectionId === "string") {
          updates.oauthConnectionId = oauthConnectionId;
        }

        // Update the webhook source with the provided fields
        await webhookSourceResource.updateRemoteMetadata(updates);

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
          webhookSourceResource.remoteMetadata &&
          webhookSourceResource.oauthConnectionId
        ) {
          try {
            const workspace = auth.workspace();
            if (!workspace) {
              throw new Error("Workspace not found");
            }

            const deleteUrl = new URL(
              `${req.headers.origin ?? ""}/api/w/${workspace.sId}/${webhookSourceResource.kind}/${webhookSourceResource.oauthConnectionId}/webhooks`
            );
            deleteUrl.searchParams.set(
              "webhookSourceId",
              webhookSourceResource.sId()
            );

            await fetch(deleteUrl.toString(), {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Cookie: req.headers.cookie ?? "",
              },
            });
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
