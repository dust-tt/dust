/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import {
  propagateWebhookSourceViewDescriptionAndIcon,
  propagateWebhookSourceViewName,
} from "@app/lib/api/webhook_source";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PatchWebhookSourceViewBodySchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z
    .string()
    .max(4000, "Description must be at most 4000 characters.")
    .optional(),
  icon: z.string().optional(),
});

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

  switch (req.method) {
    case "GET": {
      if (webhookSourceView === null) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "webhook_source_view_not_found",
            message: "Webhook source view not found",
          },
        });
      }
      if (!webhookSourceView.canRead(auth)) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: `Cannot read view with id ${viewId}.`,
          },
        });
      }
      return res.status(200).json({
        webhookSourceView: webhookSourceView.toJSON(),
      });
    }

    case "PATCH": {
      const isAdmin = await SpaceResource.canAdministrateSystemSpace(auth);
      if (!isAdmin) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "webhook_source_view_auth_error",
            message:
              "User is not authorized to update webhook source views in a space.",
          },
        });
      }
      if (webhookSourceView === null) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "webhook_source_view_not_found",
            message: "Webhook source view not found",
          },
        });
      }
      const bodyValidation = PatchWebhookSourceViewBodySchema.safeParse(
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

      const { name, description, icon } = bodyValidation.data;

      const nameResult = await webhookSourceView.updateName(auth, name);
      if (nameResult.isErr()) {
        switch (nameResult.error.code) {
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

      const updateResult = await propagateWebhookSourceViewName(
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

      if (description !== undefined || icon !== undefined) {
        // Normalize the icon to ensure it's a valid icon type
        const normalizedIcon =
          icon !== undefined ? normalizeWebhookIcon(icon) : undefined;

        const updateResult = await webhookSourceView.updateDescriptionAndIcon(
          auth,
          description,
          normalizedIcon
        );
        if (updateResult.isErr()) {
          switch (updateResult.error.code) {
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
                  message:
                    "Failed to update webhook source view description or icon.",
                },
              });
          }
        }

        // Propagate changes from system view to all space views
        const propagateResult =
          await propagateWebhookSourceViewDescriptionAndIcon(
            auth,
            webhookSourceView,
            description,
            normalizedIcon
          );
        if (propagateResult.isErr()) {
          switch (propagateResult.error.code) {
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
              assertNever(propagateResult.error.code);
          }
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

export default withSessionAuthenticationForWorkspace(handler);
