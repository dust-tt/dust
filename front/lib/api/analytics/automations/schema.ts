import { ConsumptionPeriodSchema } from "@app/lib/api/analytics/consumption/schema";
import { TRIGGER_EXECUTION_MODES } from "@app/types/assistant/triggers";
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
  executionModes: z.array(z.enum(TRIGGER_EXECUTION_MODES)).optional(),
});

export type AutomationTriggersFilter = z.infer<
  typeof AutomationTriggersFilterSchema
>;

export const AutomationTriggersQuerySchema = ConsumptionPeriodSchema.extend({
  search: z.string().trim().optional(),
  filter: AutomationTriggersFilterSchema.optional(),
});

export type AutomationTriggersQuery = z.infer<
  typeof AutomationTriggersQuerySchema
>;

export const AutomationTriggersBodySchema =
  AutomationTriggersQuerySchema.extend({
    limit: z
      .number()
      .int()
      .positive()
      .max(100)
      .default(DEFAULT_AUTOMATION_TRIGGERS_LIMIT),
    offset: z.number().int().nonnegative().default(0),
    // csv ignores limit/offset and returns every trigger matching the period,
    // search and filter, up to the same ranking cap used for the page view.
    format: z.enum(["json", "csv"]).optional().default("json"),
  });

export type AutomationTriggersBody = z.infer<
  typeof AutomationTriggersBodySchema
>;

export const UserAutomationTriggersFilterSchema = z.object({
  agentIds: z.array(z.string()).optional(),
  kinds: z.array(z.enum(["schedule", "webhook"])).optional(),
  executionModes: z.array(z.enum(TRIGGER_EXECUTION_MODES)).optional(),
});

export type UserAutomationTriggersFilter = z.infer<
  typeof UserAutomationTriggersFilterSchema
>;

export const UserAutomationTriggersBodySchema = ConsumptionPeriodSchema.extend({
  search: z.string().trim().optional(),
  filter: UserAutomationTriggersFilterSchema.optional(),
  limit: z
    .number()
    .int()
    .positive()
    .max(100)
    .default(DEFAULT_AUTOMATION_TRIGGERS_LIMIT),
  offset: z.number().int().nonnegative().default(0),
});

export type UserAutomationTriggersBody = z.infer<
  typeof UserAutomationTriggersBodySchema
>;

export const AutomationTriggerBreakdownBodySchema = ConsumptionPeriodSchema;

export type AutomationTriggerBreakdownBody = z.infer<
  typeof AutomationTriggerBreakdownBodySchema
>;
