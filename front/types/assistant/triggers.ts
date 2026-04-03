import { z } from "zod";

export const ScheduleConfigSchema = z.object({
  cron: z.string(),
  timezone: z.string(),
});

export type ScheduleConfig = z.infer<typeof ScheduleConfigSchema>;

export const WebhookConfigSchema = z.object({
  includePayload: z.boolean(),
  event: z.string().optional(),
  filter: z.string().optional(),
});

export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

export type TriggerConfigurationType = ScheduleConfig | WebhookConfig;

export type TriggerConfiguration =
  | {
      kind: "schedule";
      configuration: ScheduleConfig;
    }
  | {
      kind: "webhook";
      configuration: WebhookConfig;
      executionPerDayLimitOverride: number | null;
      webhookSourceViewId: string | null;
      executionMode: TriggerExecutionMode | null;
    };

export const DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT = 42;

export type TriggerExecutionMode = "fair_use" | "programmatic";

export const TRIGGER_STATUSES = [
  "enabled",
  "disabled",
  "relocating",
  "downgraded",
] as const;
export type TriggerStatus = (typeof TRIGGER_STATUSES)[number];

export function isValidTriggerStatus(status: string): status is TriggerStatus {
  return (TRIGGER_STATUSES as readonly string[]).includes(status);
}

export const WEBHOOK_REQUEST_TRIGGER_STATUSES = [
  "workflow_start_succeeded",
  "workflow_start_failed",
  "not_matched",
  "rate_limited",
] as const;

export type WebhookRequestTriggerStatus =
  (typeof WEBHOOK_REQUEST_TRIGGER_STATUSES)[number];

export type TriggerOrigin = "user" | "agent";

export function isValidTriggerOrigin(origin: string): origin is TriggerOrigin {
  return ["user", "agent"].includes(origin);
}

const TriggerStatusSchema = z.enum(TRIGGER_STATUSES);

export const TriggerSchema = z.discriminatedUnion("kind", [
  z.object({
    name: z.string(),
    kind: z.literal("schedule"),
    customPrompt: z.string(),
    naturalLanguageDescription: z.string().nullable(),
    configuration: ScheduleConfigSchema,
    editor: z.number().optional(),
    status: TriggerStatusSchema.optional(),
  }),
  z.object({
    name: z.string(),
    kind: z.literal("webhook"),
    customPrompt: z.string(),
    naturalLanguageDescription: z.string().nullable(),
    configuration: WebhookConfigSchema,
    webhookSourceViewId: z.string(),
    executionPerDayLimitOverride: z.number(),
    editor: z.number().optional(),
    status: TriggerStatusSchema.optional(),
  }),
]);

const TriggerBaseSchema = z.object({
  id: z.number(),
  sId: z.string(),
  name: z.string(),
  agentConfigurationId: z.string(),
  editor: z.number(),
  customPrompt: z.string().nullable(),
  status: z.enum(TRIGGER_STATUSES),
  createdAt: z.number(),
  naturalLanguageDescription: z.string().nullable(),
  origin: z.enum(["user", "agent"]),
});

export const FullTriggerSchema = z.discriminatedUnion("kind", [
  TriggerBaseSchema.extend({
    kind: z.literal("schedule"),
    configuration: ScheduleConfigSchema,
  }),
  TriggerBaseSchema.extend({
    kind: z.literal("webhook"),
    configuration: WebhookConfigSchema,
    executionPerDayLimitOverride: z.number().nullable(),
    webhookSourceViewId: z.string().nullable(),
    executionMode: z.enum(["fair_use", "programmatic"]).nullable(),
  }),
]);

export type TriggerType = z.infer<typeof FullTriggerSchema>;

export type TriggerKind = TriggerType["kind"];

export function isValidTriggerKind(kind: string): kind is TriggerKind {
  return ["schedule", "webhook"].includes(kind);
}

export type WebhookTriggerType = TriggerType & {
  kind: "webhook";
  webhookSourceViewId: string;
  executionMode: TriggerExecutionMode | null;
  executionPerDayLimitOverride: number | null;
};

export type ScheduleTriggerType = TriggerType & {
  kind: "schedule";
  configuration: ScheduleConfig;
};

export function isWebhookTrigger(
  trigger: TriggerType
): trigger is WebhookTriggerType {
  return trigger.kind === "webhook";
}

export function isScheduleTrigger(
  trigger: TriggerType
): trigger is ScheduleTriggerType {
  return trigger.kind === "schedule";
}
