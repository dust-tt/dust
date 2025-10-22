import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { checkConnectionOwnership } from "@app/lib/api/oauth";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString, OAuthAPI } from "@app/types";
import {
  isWebhookSourceKind,
  WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP,
} from "@app/types/triggers/webhooks";

export type GetServiceDataResponseType = {
  serviceData: Record<string, unknown>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetServiceDataResponseType>>,
  auth: Authenticator
): Promise<void> {
  const isAdmin = await SpaceResource.canAdministrateSystemSpace(auth);
  // Only admins can access service data
  if (!isAdmin) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can access service data",
      },
    });
  }
  switch (req.method) {
    case "GET":
      const { connectionId, kind } = req.query;

      if (!connectionId || !isString(connectionId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "connectionId is required",
          },
        });
      }

      if (!kind || !isString(kind)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "kind is required",
          },
        });
      }

      if (!isWebhookSourceKind(kind) || kind === "custom") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid kind: ${kind}. Must be a valid webhook preset kind.`,
          },
        });
      }
      const preset = WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[kind];

      // Verify the connection belongs to this user and workspace
      const ownershipCheck = await checkConnectionOwnership(auth, connectionId);
      if (ownershipCheck.isErr()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Connection does not belong to this user/workspace",
          },
        });
      }

      // Get access token from OAuth API
      const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

      // Verify the connection is for the correct provider
      const metadataRes = await oauthAPI.getConnectionMetadata({
        connectionId,
      });

      if (metadataRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Connection not found",
          },
        });
      }

      if (metadataRes.value.connection.provider !== kind) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Connection is not made for this provider",
          },
        });
      }

      const tokenRes = await oauthAPI.getAccessToken({ connectionId });

      if (tokenRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to get access token",
          },
        });
      }

      const accessToken = tokenRes.value.access_token;

      // Call getServiceData on the webhook service
      const serviceDataResult =
        await preset.webhookService.getServiceData(accessToken);

      if (serviceDataResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: serviceDataResult.error.message,
          },
        });
      }

      return res.status(200).json({
        serviceData: serviceDataResult.value,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
