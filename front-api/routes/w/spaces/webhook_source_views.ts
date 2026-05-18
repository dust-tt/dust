import { Hono } from "hono";
import { z } from "zod";

import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceKind } from "@app/types/space";

import { spaceResource } from "../../../middleware/space_resource";
import { validate } from "../../../middleware/validator";

const PostWebhookSourceViewBodySchema = z.object({
  webhookSourceId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/webhook_source_views.
export const webhookSourceViewsApp = new Hono();

webhookSourceViewsApp.get(
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

webhookSourceViewsApp.post(
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

webhookSourceViewsApp.delete(
  "/:webhookSourceViewId",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const webhookSourceViewId = c.req.param("webhookSourceViewId") ?? "";

    if (!auth.isUser()) {
      return c.json(
        {
          error: {
            type: "webhook_source_view_auth_error",
            message: "You are not authorized to access webhook source views.",
          },
        },
        401
      );
    }
    if (!auth.isAdmin()) {
      return c.json(
        {
          error: {
            type: "webhook_source_view_auth_error",
            message:
              "User is not authorized to remove webhook source views from a space.",
          },
        },
        403
      );
    }

    const view = await WebhookSourcesViewResource.fetchById(
      auth,
      webhookSourceViewId
    );
    if (!view || view.space.id !== space.id) {
      return c.json(
        {
          error: {
            type: "webhook_source_view_not_found",
            message: "Webhook Source View not found",
          },
        },
        404
      );
    }

    const allowedSpaceKinds: SpaceKind[] = ["regular", "global"];
    if (!allowedSpaceKinds.includes(space.kind)) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message:
              "Can only delete Webhook Source Views from regular or global spaces.",
          },
        },
        400
      );
    }

    try {
      await view.delete(auth, { hardDelete: true });
    } catch (err) {
      const e = normalizeError(err);
      if (e.name === "SequelizeForeignKeyConstraintError") {
        return c.json(
          {
            error: {
              type: "webhook_source_view_triggering_agent",
              message:
                "Cannot remove webhook source view while it is being used by active agents.",
            },
          },
          409
        );
      }
      throw e;
    }

    return c.json({ deleted: true });
  }
);
