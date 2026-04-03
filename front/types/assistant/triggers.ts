import { z } from "zod";

export type CronScheduleConfig = {
  type?: "cron"; // optional for backward compat with existing DB records
  cron: string;
  timezone: string;
};

// For "every N days" or "every N weeks on <dayOfWeek>"
export type IntervalScheduleConfig = {
  type: "interval";
  intervalDays: number; // e.g. 14 for bi-weekly, 3 for every 3 days
  dayOfWeek: number | null; // 0-6 (0=Sunday), null for pure day intervals
  hour: number; // 0-23
  minute: number; // 0-59
  timezone: string;
};

export type ScheduleConfig = CronScheduleConfig | IntervalScheduleConfig;

export function isCronScheduleConfig(
  config: ScheduleConfig
): config is CronScheduleConfig {
  return !config.type || config.type === "cron";
}

export function isIntervalScheduleConfig(
  config: ScheduleConfig
): config is IntervalScheduleConfig {
  return config.type === "interval";
}

const CronScheduleConfigSchema = z.object({
  type: z.literal("cron").optional(),
  cron: z.string(),
  timezone: z.string(),
});

const IntervalScheduleConfigSchema = z.object({
  type: z.literal("interval"),
  intervalDays: z.number(),
  dayOfWeek: z.number().nullable(),
  hour: z.number(),
  minute: z.number(),
  timezone: z.string(),
});

export const ScheduleConfigSchema = z.union([
  CronScheduleConfigSchema,
  IntervalScheduleConfigSchema,
]);

export const WebhookConfigSchema = z.object({
  includePayload: z.boolean(),
  event: z.string().optional(),
  filter: z.string().optional(),
});

export type WebhookConfig = {
  includePayload: boolean;
  event?: string;
  filter?: string;
};

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

// Backward compatibility: accept webhookSourceViewSId and normalize to webhookSourceViewId.
// Can be removed once all clients send webhookSourceViewId.
function isWebhookInputWithLegacySId(input: unknown): input is Record<
  string,
  unknown
> & {
  kind: "webhook";
  webhookSourceViewSId: unknown;
} {
  return (
    typeof input === "object" &&
    input !== null &&
    "kind" in input &&
    (input as Record<string, unknown>).kind === "webhook" &&
    "webhookSourceViewSId" in input &&
    !("webhookSourceViewId" in input)
  );
}

function normalizeTriggerInput(input: unknown): unknown {
  if (isWebhookInputWithLegacySId(input)) {
    const { webhookSourceViewSId, ...rest } = input;
    return { ...rest, webhookSourceViewId: webhookSourceViewSId };
  }
  return input;
}

export const TriggerSchema = z.preprocess(
  normalizeTriggerInput,
  z.discriminatedUnion("kind", [
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
  ])
);

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
