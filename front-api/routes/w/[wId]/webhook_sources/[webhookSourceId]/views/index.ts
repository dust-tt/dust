import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { WebhookSourceViewType } from "@app/types/triggers/webhooks";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type GetWebhookSourceViewsResponseBody = {
  success: true;
  views: WebhookSourceViewType[];
};

// Mounted at /api/w/:wId/webhook_sources/:webhookSourceId/views.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetWebhookSourceViewsResponseBody> => {
  const auth = ctx.get("auth");
  const webhookSourceId = ctx.req.param("webhookSourceId") ?? "";

  const webhookSourceResource = await WebhookSourceResource.fetchById(
    auth,
    webhookSourceId
  );

  if (!webhookSourceResource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "webhook_source_not_found",
        message: "The webhook source was not found.",
      },
    });
  }

  const viewResources = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    webhookSourceResource.id
  );

  return ctx.json({
    success: true,
    views: viewResources.map((view) => view.toJSON()),
  });
});

export default app;
