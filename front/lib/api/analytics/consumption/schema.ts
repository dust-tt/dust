import type { ConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/period";
import { CONSUMPTION_SCOPE_FILTER_KEYS } from "@app/lib/api/analytics/consumption/scope";
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

export const ConsumptionQuerySchema = ConsumptionPeriodSchema.extend({
  // JSON-encoded, mirroring the existing analytics filter query param: the
  // filter is a map of dimension to selected ids and does not flatten well
  // into repeated query params.
  filter: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return undefined;
      }
      try {
        return JSON.parse(value);
      } catch {
        return value; // Return the original so validation fails below.
      }
    })
    .pipe(ConsumptionFilterSchema.optional()),
});

export type ConsumptionQuery = z.infer<typeof ConsumptionQuerySchema>;

export const ConsumptionFacetsBodySchema = ConsumptionPeriodSchema.extend({
  filter: ConsumptionFilterSchema.optional(),
});

export type ConsumptionFacetsBody = z.infer<typeof ConsumptionFacetsBodySchema>;

// Every `top-*` endpoint takes the same query: the period and the filters of any
// consumption endpoint, plus how many rows to rank.
export const ConsumptionTopQuerySchema = ConsumptionQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(DEFAULT_CONSUMPTION_TOP_LIMIT),
});

export function toConsumptionPeriodInput({
  period,
  days,
}: Pick<ConsumptionQuery, "period" | "days">): ConsumptionPeriodInput {
  return period === "cycle" ? { kind: "cycle" } : { kind: "days", days };
}
