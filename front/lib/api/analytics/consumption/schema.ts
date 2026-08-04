import type { ConsumptionPeriodInput } from "@app/lib/api/analytics/consumption/period";
import { CONSUMPTION_SCOPE_DIMENSIONS } from "@app/lib/api/analytics/consumption/scope";
import { z } from "zod";

/**
 * Query-string contract shared by the consumption analytics endpoints, so the
 * period and the Explore filters are parsed the same way everywhere.
 */

export const DEFAULT_CONSUMPTION_PERIOD_DAYS = 30;

const ConsumptionFilterSchema = z.record(
  z.enum(CONSUMPTION_SCOPE_DIMENSIONS),
  z.string().array()
);

export const ConsumptionQuerySchema = z.object({
  period: z.enum(["cycle", "days"]).optional().default("cycle"),
  days: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .default(DEFAULT_CONSUMPTION_PERIOD_DAYS),
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

export function toConsumptionPeriodInput({
  period,
  days,
}: Pick<ConsumptionQuery, "period" | "days">): ConsumptionPeriodInput {
  return period === "cycle" ? { kind: "cycle" } : { kind: "days", days };
}
