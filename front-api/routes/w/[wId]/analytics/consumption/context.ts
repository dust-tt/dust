import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";

type ConsumptionAnalyticsCtx = WorkspaceAwareCtx & {
  Variables: {
    consumptionUserId?: string;
  };
};

export const consumptionAnalyticsApp = () =>
  createHono<ConsumptionAnalyticsCtx>();
