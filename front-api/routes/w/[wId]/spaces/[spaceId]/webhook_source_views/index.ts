import { Hono } from "hono";
import { z } from "zod";

import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { SpaceKind } from "@app/types/space";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

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
      return c.json(
        {
          error: {
            type: "webhook_source_view_auth_error",
            message:
              "User is not authorized to add webhook sources to a space.",
          },
        },
        403
      );
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Can only create webhook source views from regular or global spaces.",
          },
        },
        400
      );
    }

    const systemView =
      await WebhookSourcesViewResource.getWebhookSourceViewForSystemSpace(
        auth,
        webhookSourceId
      );
    if (!systemView) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Missing system view for webhook source, it should have been created when adding the webhook source.",
          },
        },
        400
      );
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
