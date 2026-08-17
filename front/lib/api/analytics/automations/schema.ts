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
  filter: AutomationTriggersFilterSchema.optional(),
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
