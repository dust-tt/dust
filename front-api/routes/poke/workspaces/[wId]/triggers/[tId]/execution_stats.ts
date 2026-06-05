import type { PokeGetTriggerExecutionStats } from "@app/lib/api/poke/triggers";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/execution_stats.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetTriggerExecutionStats> => {
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

    const stats = await WebhookRequestResource.getExecutionStatsForTrigger(
      auth,
      trigger.id
    );

    return ctx.json({
      statusBreakdown: stats.statusBreakdown,
      dailyVolume: stats.dailyVolume,
    });
  }
);

export default app;
