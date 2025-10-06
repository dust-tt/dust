import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { frontSequelize } from "@app/lib/resources/storage";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { apiError } from "@app/logger/withlogging";
import type { Result, WithAPIErrorResponse } from "@app/types";
import { assertNever, Ok } from "@app/types";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { patchWebhookSourceViewBodySchema } from "@app/types/triggers/webhooks";
import { Err } from "@dust-tt/client";

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

      const updateResult = await editWebhookSourceViewsName(
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
                  "You are not authorized to update the webhook source view.",
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

async function editWebhookSourceViewsName(
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
  if (!systemView) {
    // This should never happen as we already validated that the view is a system view
    return new Err(new DustError("unauthorized", "Only system views allowed"));
  }

  // This is the system view, update all space views with the same webhook source
  const allViews = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    webhookSourceView.webhookSourceId
  );

  // Use a single transaction to update all views atomically
  const transaction = await frontSequelize.transaction();
  try {
    for (const view of allViews) {
      if (view.sId !== webhookSourceView.sId) {
        const viewUpdateResult = await view.updateName(auth, newName, transaction);
        if (viewUpdateResult.isErr()) {
          await transaction.rollback();
          return viewUpdateResult;
        }
      }
    }
    await transaction.commit();
    return new Ok(undefined);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

export default withSessionAuthenticationForWorkspace(handler);
