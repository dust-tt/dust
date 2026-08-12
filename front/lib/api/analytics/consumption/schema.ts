import type { ConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/period";
import {
  CONSUMPTION_SCOPE_DIMENSIONS,
  CONSUMPTION_SCOPE_FILTER_KEYS,
} from "@app/lib/api/analytics/consumption/scope";
import { z } from "zod";

/** Shared validation for consumption analytics periods and filters. */

export const DEFAULT_CONSUMPTION_PERIOD_DAYS = 30;

export const DEFAULT_CONSUMPTION_TOP_LIMIT = 10;

const ConsumptionFilterSchema = z.record(
  z.enum(CONSUMPTION_SCOPE_FILTER_KEYS),
  z.string().array()
);

const ConsumptionPeriodSchema = z.object({
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

// Every `top-*` endpoint takes the same body as any other consumption
// endpoint, plus how many rows to rank.
export const ConsumptionTopBodySchema = ConsumptionBodySchema.extend({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(DEFAULT_CONSUMPTION_TOP_LIMIT),
});

export type ConsumptionTopBody = z.infer<typeof ConsumptionTopBodySchema>;

// The attribution table's CSV export: same period/filter as the `top-*`
// endpoints, scoped to whichever dimension tab is currently toggled.
export const ConsumptionExportBodySchema = ConsumptionBodySchema.extend({
  dimension: z.enum(CONSUMPTION_SCOPE_DIMENSIONS),
});

export type ConsumptionExportBody = z.infer<typeof ConsumptionExportBodySchema>;

export function toConsumptionPeriodInput({
  period,
  days,
}: Pick<ConsumptionBody, "period" | "days">): ConsumptionPeriodInput {
  return period === "cycle" ? { kind: "cycle" } : { kind: "days", days };
}
