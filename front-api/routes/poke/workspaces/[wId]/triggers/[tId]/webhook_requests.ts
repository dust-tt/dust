import type { PokeGetWebhookRequestsResponseBody } from "@app/lib/api/poke/triggers";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import { WEBHOOK_REQUEST_TRIGGER_STATUSES } from "@app/types/assistant/triggers";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const WebhookRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  status: z.enum(WEBHOOK_REQUEST_TRIGGER_STATUSES).optional(),
});

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/webhook_requests.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", WebhookRequestsQuerySchema),
  async (ctx): HandlerResult<PokeGetWebhookRequestsResponseBody> => {
    const auth = ctx.get("auth");
    const { tId } = ctx.req.valid("param");

    const trigger = await TriggerResource.fetchById(auth, tId);
    if (!trigger) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "trigger_not_found",
          message: "Trigger not found.",
        },
      });
    }

    const { limit, status } = ctx.req.valid("query");

    const requests = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
      trigger: trigger.toJSON(),
      ...(limit !== undefined ? { limit } : {}),
      status,
    });

    return ctx.json({ requests });
  }
);

export default app;
