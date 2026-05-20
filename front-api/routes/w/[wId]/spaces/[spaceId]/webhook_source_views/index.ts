import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { SpaceKind } from "@app/types/space";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

import webhookSourceViewId from "./[webhookSourceViewId]";

const PostWebhookSourceViewBodySchema = z.object({
  webhookSourceId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/webhook_source_views.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const views = await WebhookSourcesViewResource.listBySpace(auth, space);
    return c.json({
      success: true,
      webhookSourceViews: views.map((v) => v.toJSON()),
    });
  }
);

app.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PostWebhookSourceViewBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const { webhookSourceId } = c.req.valid("json");

    if (!auth.isAdmin()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "webhook_source_view_auth_error",
          message: "User is not authorized to add webhook sources to a space.",
        },
      });
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return apiError(c, {
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
      return apiError(c, {
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
    return c.json({ success: true, webhookSourceView: view.toJSON() });
  }
);

app.route("/:webhookSourceViewId", webhookSourceViewId);

export default app;
