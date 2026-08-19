import { ConsumptionPeriodSchema } from "@app/lib/api/analytics/consumption/schema";
import { z } from "zod";

export const DEFAULT_AUTOMATION_TRIGGERS_LIMIT = 25;

export const AutomationsOverviewBodySchema = ConsumptionPeriodSchema;

export type AutomationsOverviewBody = z.infer<
  typeof AutomationsOverviewBodySchema
>;

export const AutomationTriggersFilterSchema = z.object({
  agentIds: z.array(z.string()).optional(),
  editorIds: z.array(z.string()).optional(),
  kinds: z.array(z.enum(["schedule", "webhook"])).optional(),
});

export type AutomationTriggersFilter = z.infer<
  typeof AutomationTriggersFilterSchema
>;

export const AutomationTriggersBodySchema = ConsumptionPeriodSchema.extend({
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(DEFAULT_AUTOMATION_TRIGGERS_LIMIT),
  offset: z.number().int().nonnegative().default(0),
  search: z.string().trim().optional(),
  filter: AutomationTriggersFilterSchema.optional(),
  // csv ignores limit/offset and returns every trigger matching the period,
  // search and filter, up to the same ranking cap used for the page view.
  format: z.enum(["json", "csv"]).optional().default("json"),
});

export type AutomationTriggersBody = z.infer<
  typeof AutomationTriggersBodySchema
>;

export const AutomationTriggerBreakdownBodySchema =
  ConsumptionPeriodSchema.extend({
    triggerId: z.string().min(1),
  });

export type AutomationTriggerBreakdownBody = z.infer<
  typeof AutomationTriggerBreakdownBodySchema
>;
