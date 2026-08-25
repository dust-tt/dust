import type {
  ConsumptionScopeDimension,
  ConsumptionScopeFilter,
} from "@app/lib/api/analytics/consumption/scope";
import { createHono } from "@front-api/lib/hono";
import type { WorkspaceAwareCtx } from "@front-api/middlewares/ctx";

type ConsumptionAnalyticsCtx = WorkspaceAwareCtx & {
  Variables: {
    consumptionExcludedDimensions?: ConsumptionScopeDimension[];
    consumptionRequiredFilter?: ConsumptionScopeFilter;
  };
};

export const consumptionAnalyticsApp = () =>
  createHono<ConsumptionAnalyticsCtx>();

export function applyConsumptionRequiredFilter(
  filter: ConsumptionScopeFilter | undefined,
  requiredFilter: ConsumptionScopeFilter | undefined
): ConsumptionScopeFilter | undefined {
  return requiredFilter ? { ...filter, ...requiredFilter } : filter;
}
