import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetWebhookSourceViewsListResponseBody } from "@app/lib/resources/webhook_sources_view_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import viewById from "./[viewId]";

const GetWebhookSourceViewsQuerySchema = z.object({
  spaceIds: z.string(),
});

// Mounted at /api/w/:wId/webhook_sources/views.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetWebhookSourceViewsQuerySchema),
  async (ctx): HandlerResult<GetWebhookSourceViewsListResponseBody> => {
    const auth = ctx.get("auth");
    const { spaceIds: rawSpaceIds } = ctx.req.valid("query");
    const spaceIds = rawSpaceIds.length > 0 ? rawSpaceIds.split(",") : [];

    const spaces = await SpaceResource.fetchByIds(auth, spaceIds);
    const allowedSpaces = spaces.filter((s) => s.canReadOrAdministrate(auth));
    const views = await WebhookSourcesViewResource.listBySpaces(
      auth,
      allowedSpaces
    );

    return ctx.json({
      success: true,
      webhookSourceViews: views.map((v) => v.toJSON()),
    });
  }
);

app.route("/:viewId", viewById);

export default app;
