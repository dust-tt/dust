import {
  propagateWebhookSourceViewDescriptionAndIcon,
  propagateWebhookSourceViewName,
} from "@app/lib/api/webhook_source";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { normalizeWebhookIcon } from "@app/lib/webhook_source";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PatchWebhookSourceViewBodySchema = z.object({
  name: z.string().min(1),
  description: z
    .string()
    .max(4000, "Description must be at most 4000 characters.")
    .optional(),
  icon: z.string().optional(),
});

const ParamsSchema = z.object({
  viewId: z.string(),
});

export type GetWebhookSourceViewResponseBody = {
  webhookSourceView: WebhookSourceViewType;
};

export type PatchWebhookSourceViewResponseBody = {
  webhookSourceView: WebhookSourceViewType;
};

// Mounted at /api/w/:wId/webhook_sources/views/:viewId.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetWebhookSourceViewResponseBody> => {
    const auth = ctx.get("auth");
    const { viewId } = ctx.req.valid("param");

    const webhookSourceView = await WebhookSourcesViewResource.fetchById(
      auth,
      viewId
    );

    if (webhookSourceView === null) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "webhook_source_view_not_found",
          message: "Webhook source view not found",
        },
      });
    }
    if (!webhookSourceView.canRead(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: `Cannot read view with id ${viewId}.`,
        },
      });
    }
    return ctx.json({
      webhookSourceView: webhookSourceView.toJSON(),
    });
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchWebhookSourceViewBodySchema),
  async (ctx): HandlerResult<PatchWebhookSourceViewResponseBody> => {
    const auth = ctx.get("auth");
    const { viewId } = ctx.req.valid("param");

    const isAdmin = await SpaceResource.canAdministrateSystemSpace(auth);
    if (!isAdmin) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "webhook_source_view_auth_error",
          message:
            "User is not authorized to update webhook source views in a space.",
        },
      });
    }

    const webhookSourceView = await WebhookSourcesViewResource.fetchById(
      auth,
      viewId
    );

    if (webhookSourceView === null) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "webhook_source_view_not_found",
          message: "Webhook source view not found",
        },
      });
    }

    // Validate that this is a system view
    if (webhookSourceView.space.kind !== "system") {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Updates can only be performed on system views.",
        },
      });
    }

    const { name, description, icon } = ctx.req.valid("json");

    const nameResult = await webhookSourceView.updateName(auth, name);
    if (nameResult.isErr()) {
      switch (nameResult.error.code) {
        case "unauthorized":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "webhook_source_view_auth_error",
              message:
                "You are not authorized to update this webhook source view.",
            },
          });
        default:
          return apiError(ctx, {
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
          return apiError(ctx, {
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

      const descIconResult = await webhookSourceView.updateDescriptionAndIcon(
        auth,
        description,
        normalizedIcon
      );
      if (descIconResult.isErr()) {
        switch (descIconResult.error.code) {
          case "unauthorized":
            return apiError(ctx, {
              status_code: 401,
              api_error: {
                type: "webhook_source_view_auth_error",
                message:
                  "You are not authorized to update this webhook source view.",
              },
            });
          default:
            return apiError(ctx, {
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
            return apiError(ctx, {
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

    return ctx.json({
      webhookSourceView: webhookSourceView.toJSON(),
    });
  }
);

export default app;
