import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import type { GetTriggerEstimationResponseBody } from "@app/lib/triggers/trigger_usage_estimation";
import { computeFilteredWebhookTriggerForecast } from "@app/lib/triggers/trigger_usage_estimation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const GetTriggerEstimationQuerySchema = z.object({
  filter: z.string().optional(),
  event: z.string().optional(),
});

const ParamsSchema = z.object({
  webhookSourceId: z.string(),
});

// Mounted at /api/w/:wId/webhook_sources/:webhookSourceId/trigger-estimation.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", GetTriggerEstimationQuerySchema),
  async (ctx): HandlerResult<GetTriggerEstimationResponseBody> => {
    const auth = ctx.get("auth");
    const { webhookSourceId } = ctx.req.valid("param");
    const { filter, event } = ctx.req.valid("query");

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

    const estimationResult = await computeFilteredWebhookTriggerForecast(auth, {
      webhookSource: webhookSourceResource,
      filter,
      event,
    });

    if (estimationResult.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: estimationResult.error.message,
        },
      });
    }

    return ctx.json(estimationResult.value);
  }
);

export default app;
