import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { GitHubWebhookService } from "@app/lib/triggers/services/github_webhook_service";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type CreateGithubWebhookResponseType = {
  webhookIds: Record<string, string>;
  errors?: string[];
};

export type DeleteGithubWebhookResponseType = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      CreateGithubWebhookResponseType | DeleteGithubWebhookResponseType
    >
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Only builders can create GitHub webhooks",
          },
        });
      }

      const { connectionId, remoteMetadata, webhookUrl, events, secret } =
        req.body;

      if (!isString(connectionId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "connectionId is required",
          },
        });
      }

      if (!remoteMetadata || typeof remoteMetadata !== "object") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "remoteMetadata is required",
          },
        });
      }

      if (!isString(remoteMetadata.repository)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "remoteMetadata.repository is required",
          },
        });
      }

      if (!isString(webhookUrl)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "webhookUrl is required",
          },
        });
      }

      if (!Array.isArray(events) || events.length === 0) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "events array is required",
          },
        });
      }

      try {
        const service = new GitHubWebhookService();
        const result = await service.createWebhooks({
          auth,
          connectionId,
          remoteMetadata,
          webhookUrl,
          events,
          secret,
        });

        if (result.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: result.error.message,
            },
          });
        }

        return res.status(201).json(result.value);
      } catch (error: any) {
        return apiError(req, res, {
          status_code: error.status || 500,
          api_error: {
            type: "internal_server_error",
            message: error.message || "Failed to create webhook",
          },
        });
      }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
