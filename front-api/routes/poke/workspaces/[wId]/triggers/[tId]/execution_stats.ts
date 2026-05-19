import { Hono } from "hono";

import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";

import { apiError } from "@front-api/middleware/utils";

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
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const tId = c.req.param("tId");
  if (!tId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
      },
    });
  }

  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(c, {
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

  const body: PokeGetTriggerExecutionStats = {
    statusBreakdown: stats.statusBreakdown,
    dailyVolume: stats.dailyVolume,
  };
  return c.json(body);
});

export default app;
