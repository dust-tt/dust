import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";
import * as t from "io-ts";

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
      webhookSourceViewSId: string | null;
      executionMode: TriggerExecutionMode | null;
    };

export const DEFAULT_SINGLE_TRIGGER_EXECUTION_PER_DAY_LIMIT = 42;

export type TriggerType = {
  id: ModelId;
  sId: string;
  name: string;
  agentConfigurationId: AgentConfigurationType["sId"];
  editor: UserType["id"];
  customPrompt: string | null;
  status: TriggerStatus;
  createdAt: number;
  naturalLanguageDescription: string | null;
  origin: TriggerOrigin;
} & TriggerConfiguration;

export type TriggerKind = TriggerType["kind"];

export function isValidTriggerKind(kind: string): kind is TriggerKind {
  return ["schedule", "webhook"].includes(kind);
}

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

export type WebhookTriggerType = TriggerType & {
  kind: "webhook";
  webhookSourceViewSId: string;
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

const CronScheduleConfigSchema = t.intersection([
  t.type({
    cron: t.string,
    timezone: t.string,
  }),
  t.partial({
    type: t.literal("cron"),
  }),
]);

const IntervalScheduleConfigSchema = t.type({
  type: t.literal("interval"),
  intervalDays: t.number,
  dayOfWeek: t.union([t.number, t.null]),
  hour: t.number,
  minute: t.number,
  timezone: t.string,
});

const ScheduleConfigSchema = t.union([
  CronScheduleConfigSchema,
  IntervalScheduleConfigSchema,
]);

const WebhookConfigSchema = t.intersection([
  t.type({
    includePayload: t.boolean,
  }),
  t.partial({
    event: t.string,
    filter: t.string,
  }),
]);

const TriggerStatusSchema = t.union([
  t.literal("enabled"),
  t.literal("disabled"),
  t.literal("relocating"),
  t.literal("downgraded"),
]);

export const TriggerSchema = t.union([
  t.intersection([
    t.type({
      name: t.string,
      kind: t.literal("schedule"),
      customPrompt: t.string,
      naturalLanguageDescription: t.union([t.string, t.null]),
      configuration: ScheduleConfigSchema,
      editor: t.union([t.number, t.undefined]),
    }),
    t.partial({
      status: TriggerStatusSchema,
    }),
  ]),
  t.intersection([
    t.type({
      name: t.string,
      kind: t.literal("webhook"),
      customPrompt: t.string,
      naturalLanguageDescription: t.union([t.string, t.null]),
      configuration: WebhookConfigSchema,
      webhookSourceViewSId: t.string,
      executionPerDayLimitOverride: t.number,
      editor: t.union([t.number, t.undefined]),
    }),
    t.partial({
      status: TriggerStatusSchema,
    }),
  ]),
]);
