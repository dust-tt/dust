import type {
  GetWebhookSourceViewsResponseBody,
  PostWebhookSourceViewResponseBody,
} from "@app/lib/api/webhook_source";
import { PostWebhookSourceViewBodySchema } from "@app/lib/api/webhook_source";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { SpaceKind } from "@app/types/space";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

import webhookSourceViewId from "./[webhookSourceViewId]";

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
  ensureIsAdmin(),
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostWebhookSourceViewBodySchema),
  async (ctx): HandlerResult<PostWebhookSourceViewResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { webhookSourceId } = ctx.req.valid("json");

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
