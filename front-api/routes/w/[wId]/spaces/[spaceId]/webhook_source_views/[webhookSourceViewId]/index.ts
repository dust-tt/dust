import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { SpaceKind } from "@app/types/space";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsUser } from "@front-api/middlewares/ensure_is_user";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

export type DeleteWebhookSourceViewResponseBody = {
  deleted: boolean;
};

// Mounted under
// /api/w/:wId/spaces/:spaceId/webhook_source_views/:webhookSourceViewId.
const app = workspaceApp();

app.delete(
  "/",
  ensureIsUser(),
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<DeleteWebhookSourceViewResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const webhookSourceViewId = ctx.req.param("webhookSourceViewId") ?? "";

    if (!auth.isAdmin()) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "webhook_source_view_not_found",
          message: "Webhook Source View not found",
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
            "Can only delete Webhook Source Views from regular or global spaces.",
        },
      });
    }

    try {
      await view.delete(auth, { hardDelete: true });
    } catch (err) {
      const e = normalizeError(err);
      if (e.name === "SequelizeForeignKeyConstraintError") {
        return apiError(ctx, {
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

    return ctx.json({ deleted: true });
  }
);

export default app;
