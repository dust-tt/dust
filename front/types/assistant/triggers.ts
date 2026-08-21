import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
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

const ScheduleConfigSchema = z.union([
  CronScheduleConfigSchema,
  IntervalScheduleConfigSchema,
]);

const WebhookConfigSchema = z.object({
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

export const DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT = 42;

export const TRIGGER_EXECUTION_MODES = ["user_pool", "workspace_pool"] as const;
export type TriggerExecutionMode = (typeof TRIGGER_EXECUTION_MODES)[number];

export function isTriggerExecutionMode(
  value: string
): value is TriggerExecutionMode {
  return (TRIGGER_EXECUTION_MODES as readonly string[]).includes(value);
}

export type BulkTriggerUpdateOutcome = {
  updatedCount: number;
  // Triggers the caller may not move (insufficient role or permission).
  skippedCount: number;
};

export const TRIGGER_STATUSES = [
  "enabled",
  "disabled",
  "disabled_by_manager",
  "relocating",
  "downgraded",
] as const;
export type TriggerStatus = (typeof TRIGGER_STATUSES)[number];

export function isValidTriggerStatus(status: string): status is TriggerStatus {
  return (TRIGGER_STATUSES as readonly string[]).includes(status);
}

// Who may set or clear a status: the trigger's editor, only an admin, or only
// Dust's bulk jobs (workspace relocation, plan downgrade).
export type TriggerStatusOwner = "editor" | "admin" | "system";

export function getTriggerStatusOwner(
  status: TriggerStatus
): TriggerStatusOwner {
  switch (status) {
    case "enabled":
    case "disabled":
      return "editor";
    case "disabled_by_manager":
      return "admin";
    case "relocating":
    case "downgraded":
      return "system";
    default:
      // Called from client components: a status shipped server-first must not
      // crash old clients. Unknown statuses are treated as locked.
      assertNeverAndIgnore(status);
      return "system";
  }
}

export const WEBHOOK_REQUEST_TRIGGER_STATUSES = [
  "workflow_start_succeeded",
  "workflow_start_failed",
  "not_matched",
  "rate_limited",
  "credits_exhausted",
] as const;

export type WebhookRequestTriggerStatus =
  (typeof WEBHOOK_REQUEST_TRIGGER_STATUSES)[number];

// Who created the trigger: the user themselves, an agent through the schedule
// management tool, or Dust provisioning it on the user's behalf.
export type TriggerOrigin = "user" | "agent" | "system";

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
    executionMode: z.enum(TRIGGER_EXECUTION_MODES).optional(),
    spaceId: z.string().nullable().optional(),
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
    executionMode: z.enum(TRIGGER_EXECUTION_MODES).optional(),
    spaceId: z.string().nullable().optional(),
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
  origin: z.enum(["user", "agent", "system"]),
  spaceId: z.string().nullable(),
  executionMode: z.enum(TRIGGER_EXECUTION_MODES),
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
