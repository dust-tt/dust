import { DEFAULT_CONSUMPTION_PERIOD_DAYS } from "@app/lib/analytics/consumption_period";
import type { ConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/period";
import {
  CONSUMPTION_FACET_SCOPES,
  CONSUMPTION_METRICS,
  CONSUMPTION_SCOPE_DIMENSIONS,
  CONSUMPTION_SCOPE_FILTER_KEYS,
  CONSUMPTION_TOP_GROUP_SORT_BY,
  CONSUMPTION_TOP_SORT_ORDER,
  DEFAULT_CONSUMPTION_METRIC,
} from "@app/lib/api/analytics/consumption/scope";
import { z } from "zod";

/** Shared validation for consumption analytics periods and filters. */

export const DEFAULT_CONSUMPTION_TOP_LIMIT = 10;

const ConsumptionFilterSchema = z.record(
  z.enum(CONSUMPTION_SCOPE_FILTER_KEYS),
  z.string().array()
);

export const ConsumptionPeriodSchema = z.object({
  period: z.enum(["cycle", "days"]).optional().default("cycle"),
  days: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_CONSUMPTION_PERIOD_DAYS),
});

// Every consumption endpoint takes at least this body: the period and the
// filter (a map of dimension to selected ids). All of them are POST so the
// filter can travel in the JSON body instead of a URL, which would cap the
// number of selectable filter values.
export const ConsumptionBodySchema = ConsumptionPeriodSchema.extend({
  filter: ConsumptionFilterSchema.optional(),
});

export type ConsumptionBody = z.infer<typeof ConsumptionBodySchema>;

export const ConsumptionFacetsBodySchema = ConsumptionBodySchema.extend({
  scope: z.enum(CONSUMPTION_FACET_SCOPES).optional().default("all"),
  dimensions: z.array(z.enum(CONSUMPTION_SCOPE_DIMENSIONS)).min(1).optional(),
});

export type ConsumptionFacetsBody = z.infer<typeof ConsumptionFacetsBodySchema>;

export const DEFAULT_CONSUMPTION_BREAKDOWN_COUNT = 10;

export const ConsumptionTimeseriesBodySchema = ConsumptionBodySchema.extend({
  granularity: z.enum(["day", "week", "month"]).optional().default("day"),
  mode: z.enum(["period", "cumulative"]).optional().default("period"),
  metric: z
    .enum(CONSUMPTION_METRICS)
    .optional()
    .default(DEFAULT_CONSUMPTION_METRIC),
  breakdownBy: z.enum(CONSUMPTION_SCOPE_DIMENSIONS).optional(),
  breakdownCount: z
    .number()
    .int()
    .positive()
    .max(50)
    .optional()
    .default(DEFAULT_CONSUMPTION_BREAKDOWN_COUNT),
});

export type ConsumptionTimeseriesBody = z.infer<
  typeof ConsumptionTimeseriesBodySchema
>;

// Every `top-*` endpoint takes the same body as any other consumption
// endpoint, plus how many rows to rank.
export const ConsumptionTopBodySchema = ConsumptionBodySchema.extend({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .nullable()
    .optional()
    .default(DEFAULT_CONSUMPTION_TOP_LIMIT)
    .transform((limit) => limit ?? DEFAULT_CONSUMPTION_TOP_LIMIT),
  offset: z.number().int().nonnegative().default(0),
  search: z.string().trim().optional(),
  // Always ranks by gross credits; see the comment on
  // CONSUMPTION_TOP_SORT_ORDER for why other metrics aren't supported yet.
  sortOrder: z.enum(CONSUMPTION_TOP_SORT_ORDER).optional().default("desc"),
});

export type ConsumptionTopBody = z.infer<typeof ConsumptionTopBodySchema>;

export const ConsumptionTopGroupsBodySchema = ConsumptionTopBodySchema.extend({
  sortBy: z.enum(CONSUMPTION_TOP_GROUP_SORT_BY).optional(),
});

export type ConsumptionTopGroupsBody = z.infer<
  typeof ConsumptionTopGroupsBodySchema
>;

// The attribution table's CSV export: same period/filter as the `top-*`
// endpoints, but always returns the breakdown for every dimension.
export const ConsumptionExportBodySchema = ConsumptionBodySchema;

export type ConsumptionExportBody = z.infer<typeof ConsumptionExportBodySchema>;

export function toConsumptionPeriodInput({
  period,
  days,
}: Pick<ConsumptionBody, "period" | "days">): ConsumptionPeriodInput {
  return period === "cycle" ? { kind: "cycle" } : { kind: "days", days };
}
