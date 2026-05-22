import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { SpaceKind } from "@app/types/space";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

import webhookSourceViewId from "./[webhookSourceViewId]";

export type GetWebhookSourceViewsResponseBody = {
  success: boolean;
  webhookSourceViews: WebhookSourceViewType[];
};

export type PostWebhookSourceViewResponseBody = {
  success: boolean;
  webhookSourceView: WebhookSourceViewType;
};

const PostWebhookSourceViewBodySchema = z.object({
  webhookSourceId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/webhook_source_views.
const app = workspaceApp();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetWebhookSourceViewsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const views = await WebhookSourcesViewResource.listBySpace(auth, space);
    return ctx.json({
      success: true,
      webhookSourceViews: views.map((v) => v.toJSON()),
    });
  }
);

app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostWebhookSourceViewBodySchema),
  async (ctx): HandlerResult<PostWebhookSourceViewResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { webhookSourceId } = ctx.req.valid("json");

    if (!auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "webhook_source_view_auth_error",
          message: "User is not authorized to add webhook sources to a space.",
        },
      });
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Can only create webhook source views from regular or global spaces.",
        },
      });
    }

    const systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        webhookSourceId
      );
    if (!systemView) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Missing system view for webhook source, it should have been created when adding the webhook source.",
        },
      });
    }

    const view = await WebhookSourcesViewResource.create(auth, {
      systemView,
      space,
    });
    return ctx.json({ success: true, webhookSourceView: view.toJSON() });
  }
);

app.route("/:webhookSourceViewId", webhookSourceViewId);

export default app;
