import type { NextApiRequest, NextApiResponse } from "next";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { normalizeWebhookIcon } from "@app/lib/webhookSource";
import { apiError } from "@app/logger/withlogging";
import type { Result, WithAPIErrorResponse } from "@app/types";
import { assertNever, Err, Ok } from "@app/types";
import type { WebhookSourceViewWithWebhookSourceType } from "@app/types/triggers/webhooks";
import { patchWebhookSourceViewBodySchema } from "@app/types/triggers/webhooks";

export type GetWebhookSourceViewResponseBody = {
  webhookSourceView: WebhookSourceViewWithWebhookSourceType;
};

export type PatchWebhookSourceViewResponseBody = {
  webhookSourceView: WebhookSourceViewWithWebhookSourceType;
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
        const propagateResult = await editWebhookSourceDescriptionAndIcon(
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

async function editWebhookSourceViewsName(
  auth: Authenticator,
  webhookSourceView: WebhookSourcesViewResource,
  newName: string
): Promise<Result<undefined, DustError<"unauthorized">>> {
  const systemView =
    await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
      auth,
      webhookSourceView.webhookSourceSId
    );

  if (!systemView) {
    // This should never happen as we already validated that the view is a system view
    return new Err(new DustError("unauthorized", "Only system views allowed"));
  }

  // Get all views with the same webhook source (excluding the system view already updated)
  const allViews = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    webhookSourceView.webhookSourceId
  );

  // Check that the user can administrate all views
  for (const view of allViews) {
    if (view.sId !== webhookSourceView.sId && !view.canAdministrate(auth)) {
      return new Err(
        new DustError("unauthorized", "Not allowed to update all views.")
      );
    }
  }

  // Get IDs of views to update (excluding the system view)
  const viewIdsToUpdate = allViews
    .filter((view) => view.sId !== webhookSourceView.sId)
    .map((view) => view.id);

  if (viewIdsToUpdate.length === 0) {
    return new Ok(undefined);
  }

  // Bulk update all views at once
  await WebhookSourcesViewResource.bulkUpdateName(
    auth,
    viewIdsToUpdate,
    newName
  );

  return new Ok(undefined);
}

async function editWebhookSourceDescriptionAndIcon(
  auth: Authenticator,
  webhookSourceView: WebhookSourcesViewResource,
  description?: string,
  icon?: InternalAllowedIconType | CustomResourceIconType
): Promise<Result<undefined, DustError<"unauthorized">>> {
  const systemView =
    await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
      auth,
      webhookSourceView.webhookSourceSId
    );

  if (!systemView) {
    // This should never happen as we already validated that the view is a system view
    return new Err(new DustError("unauthorized", "Only system views allowed"));
  }

  // Get all views with the same webhook source (excluding the system view already updated)
  const allViews = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    webhookSourceView.webhookSourceId
  );

  // Check that the user can administrate all views
  for (const view of allViews) {
    if (view.sId !== webhookSourceView.sId && !view.canAdministrate(auth)) {
      return new Err(
        new DustError("unauthorized", "Not allowed to update all views.")
      );
    }
  }

  // Get IDs of views to update (excluding the system view)
  const viewIdsToUpdate = allViews
    .filter((view) => view.sId !== webhookSourceView.sId)
    .map((view) => view.id);

  if (viewIdsToUpdate.length === 0) {
    return new Ok(undefined);
  }

  // Bulk update all views at once
  await WebhookSourcesViewResource.bulkUpdateDescriptionAndIcon(
    auth,
    viewIdsToUpdate,
    description,
    icon
  );

  return new Ok(undefined);
}

export default withSessionAuthenticationForWorkspace(handler);
