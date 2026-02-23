import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";
import * as t from "io-ts";

export type ScheduleConfig = {
  cron: string;
  timezone: string;
};

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

const ScheduleConfigSchema = t.type({
  cron: t.string,
  timezone: t.string,
});

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
