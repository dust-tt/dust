import * as t from "io-ts";

import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";

export type ScheduleConfig = {
  cron: string;
  timezone: string;
};

export type WebhookConfig = {
  includePayload: boolean;
  event?: string | null;
  filter?: string | null;
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
    };

export type TriggerType = {
  id: ModelId;
  sId: string;
  name: string;
  agentConfigurationId: AgentConfigurationType["sId"];
  editor: UserType["id"];
  customPrompt: string | null;
  enabled: boolean;
  webhookSourceViewSId?: string | null;
  createdAt: number;
} & TriggerConfiguration;

export type TriggerKind = TriggerType["kind"];

export function isValidTriggerKind(kind: string): kind is TriggerKind {
  return ["schedule", "webhook"].includes(kind);
}

export type WebhookTriggerType = TriggerType & {
  kind: "webhook";
  webhookSourceViewSId: string;
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
    event: t.union([t.string, t.null]),
  }),
  t.partial({
    filter: t.union([t.string, t.null]),
  }),
]);

export const TriggerSchema = t.union([
  t.type({
    name: t.string,
    kind: t.literal("schedule"),
    customPrompt: t.string,
    configuration: ScheduleConfigSchema,
    editor: t.union([t.number, t.undefined]),
  }),
  t.type({
    name: t.string,
    kind: t.literal("webhook"),
    customPrompt: t.string,
    configuration: WebhookConfigSchema,
    webhookSourceViewSId: t.string,
    editor: t.union([t.number, t.undefined]),
  }),
]);
