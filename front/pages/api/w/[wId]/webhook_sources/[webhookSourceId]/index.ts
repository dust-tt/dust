import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

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
  const isAdmin = await SpaceResource.canAdministrateSystemSpace(auth);
  if (!isAdmin) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admin can manage webhook sources.",
      },
    });
  }

  const { webhookSourceId } = req.query;
  if (!isString(webhookSourceId)) {
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
    }

    case "DELETE": {
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

      const deleteResult = await webhookSourceResource.delete(auth);
      if (deleteResult.isErr()) {
        throw deleteResult.error;
      }

      return res.status(200).json({
        success: true,
      });
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
