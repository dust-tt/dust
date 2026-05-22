import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type PokeGetTriggerExecutionStats = {
  statusBreakdown: Record<string, number>;
  dailyVolume: Array<{
    date: string;
    succeeded: number;
    failed: number;
    notMatched: number;
    rateLimited: number;
  }>;
};

// Mounted at /api/poke/workspaces/:wId/triggers/:tId/execution_stats.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeGetTriggerExecutionStats> => {
  const auth = ctx.get("auth");
  const tId = ctx.req.param("tId");
  if (!tId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
      },
    });
  }

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
});

export default app;
