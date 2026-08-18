import { ConsumptionPeriodSchema } from "@app/lib/api/analytics/consumption/schema";
import { z } from "zod";

export const DEFAULT_AUTOMATION_TRIGGERS_LIMIT = 25;

export const AutomationsOverviewBodySchema = ConsumptionPeriodSchema;

export type AutomationsOverviewBody = z.infer<
  typeof AutomationsOverviewBodySchema
>;

export const AutomationTriggersBodySchema = ConsumptionPeriodSchema.extend({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(DEFAULT_AUTOMATION_TRIGGERS_LIMIT),
  offset: z.number().int().nonnegative().default(0),
});

export type AutomationTriggersBody = z.infer<
  typeof AutomationTriggersBodySchema
>;
