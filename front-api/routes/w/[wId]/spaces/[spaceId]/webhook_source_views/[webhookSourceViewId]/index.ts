import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceKind } from "@app/types/space";

import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under
// /api/w/:wId/spaces/:spaceId/webhook_source_views/:webhookSourceViewId.
const app = new Hono();

app.delete(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const webhookSourceViewId = c.req.param("webhookSourceViewId") ?? "";

    if (!auth.isUser()) {
      return apiError(c, {
        status_code: 401,
        api_error: {
          type: "webhook_source_view_auth_error",
          message: "You are not authorized to access webhook source views.",
        },
      });
    }
    if (!auth.isAdmin()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "webhook_source_view_auth_error",
          message:
            "User is not authorized to remove webhook source views from a space.",
        },
      });
    }

    const view = await WebhookSourcesViewResource.fetchById(
      auth,
      webhookSourceViewId
    );
    if (!view || view.space.id !== space.id) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "webhook_source_view_not_found",
          message: "Webhook Source View not found",
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
            "Can only delete Webhook Source Views from regular or global spaces.",
        },
      });
    }

    try {
      await view.delete(auth, { hardDelete: true });
    } catch (err) {
      const e = normalizeError(err);
      if (e.name === "SequelizeForeignKeyConstraintError") {
        return apiError(c, {
          status_code: 409,
          api_error: {
            type: "webhook_source_view_triggering_agent",
            message:
              "Cannot remove webhook source view while it is being used by active agents.",
          },
        });
      }
      throw e;
    }

    return c.json({ deleted: true });
  }
);

export default app;
