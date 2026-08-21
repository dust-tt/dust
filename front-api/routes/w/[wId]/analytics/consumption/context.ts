import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";

type ConsumptionAnalyticsCtx = {
  Variables: WorkspaceAwareCtx["Variables"] & {
    consumptionRequiredFilter?: ConsumptionScopeFilter;
  };
};

export const consumptionAnalyticsApp = () =>
  createHono<ConsumptionAnalyticsCtx>();
