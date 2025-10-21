import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { OAuthAPI } from "@app/types";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

export type GetServiceDataResponseType = {
  serviceData: Record<string, any>;
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

      if (!connectionId || typeof connectionId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "connectionId is required",
          },
        });
      }

      if (!kind || typeof kind !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "kind is required",
          },
        });
      }

      // Validate that kind is a valid webhook source kind (excluding "custom")
      const preset =
        WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[
          kind as keyof typeof WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP
        ];
      if (!preset || kind === "custom") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid kind: ${kind}. Must be a valid webhook preset kind.`,
          },
        });
      }

      // Check if the preset has a webhookService
      if (!("webhookService" in preset)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Kind ${kind} does not support service data retrieval.`,
          },
        });
      }

      try {
        // Get access token from OAuth API
        const oauthAPI = new OAuthAPI(config.getOAuthAPIConfig(), console);

        // First, verify the connection belongs to this workspace
        const metadataRes = await oauthAPI.getConnectionMetadata({
          connectionId,
        });

        if (metadataRes.isErr()) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: "OAuth connection not found",
            },
          });
        }

        const workspace = auth.workspace();
        if (!workspace) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "workspace_not_found",
              message: "Workspace not found",
            },
          });
        }

        const workspaceId = metadataRes.value.connection.metadata.workspace_id;
        if (!workspaceId || workspaceId !== workspace.sId) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "Connection does not belong to this workspace",
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
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message:
              error instanceof Error
                ? error.message
                : "Failed to fetch service data",
          },
        });
      }

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
