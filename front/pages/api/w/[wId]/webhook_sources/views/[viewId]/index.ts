import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { Result, WithAPIErrorResponse } from "@app/types";
import { assertNever, Ok } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { patchWebhookSourceViewBodySchema } from "@app/types/triggers/webhooks";

export type GetWebhookSourceViewResponseBody = {
  webhookSourceView: WebhookSourceViewType;
};

export type PatchWebhookSourceViewResponseBody = {
  webhookSourceView: WebhookSourceViewType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetWebhookSourceViewResponseBody | PatchWebhookSourceViewResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { viewId } = req.query;

  if (typeof viewId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const webhookSourceView = await WebhookSourcesViewResource.fetchById(
    auth,
    viewId
  );

  if (webhookSourceView === null) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "webhook_source_view_not_found",
        message: "Webhook source view not found",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      return res.status(200).json({
        webhookSourceView: webhookSourceView.toJSON(),
      });
    }

    case "PATCH": {
      const bodyValidation = patchWebhookSourceViewBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      // Validate that this is a system view
      if (webhookSourceView.space.kind !== "system") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Updates can only be performed on system views.",
          },
        });
      }

      const { name } = bodyValidation.data;

      const result = await webhookSourceView.updateName(auth, name);
      if (result.isErr()) {
        switch (result.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "webhook_source_view_auth_error",
                message:
                  "You are not authorized to update this webhook source view.",
              },
            });
          default:
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to update webhook source view name.",
              },
            });
        }
      }

      const updateResult = await propagateSystemViewNameChange(
        auth,
        webhookSourceView,
        name
      );
      if (updateResult.isErr()) {
        switch (updateResult.error.code) {
          case "unauthorized":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "workspace_auth_error",
                message:
                  "You are not authorized to update the MCP server view.",
              },
            });
          default:
            assertNever(updateResult.error.code);
        }
      }

      return res.status(200).json({
        webhookSourceView: webhookSourceView.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET and PATCH are expected.",
        },
      });
  }
}

async function propagateSystemViewNameChange(
  auth: Authenticator,
  webhookSourceView: WebhookSourcesViewResource,
  newName: string
): Promise<Result<undefined, DustError<"unauthorized">>> {
  // Propagate changes to system view and all space views
  const systemView =
    await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
      auth,
      webhookSourceView.webhookSourceSId
    );

  const isSystemView = systemView?.sId === webhookSourceView.sId;

  if (isSystemView) {
    // This is the system view, update all space views with the same webhook source
    const allViews = await WebhookSourcesViewResource.listByWebhookSource(
      auth,
      webhookSourceView.webhookSourceId
    );

    for (const view of allViews) {
      if (view.sId !== webhookSourceView.sId) {
        const viewUpdateResult = await view.updateName(auth, newName);
        if (viewUpdateResult.isErr()) {
          return viewUpdateResult;
        }
      }
    }
  }
  return new Ok(undefined);
}

export default withSessionAuthenticationForWorkspace(handler);
