import * as t from "io-ts";

import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { UserType } from "@app/types/user";

export type ScheduleConfig = {
  cron: string;
  timezone: string;
};

export type TriggerConfigurationType = ScheduleConfig;

export type TriggerConfiguration = {
  kind: "schedule";
  configuration: ScheduleConfig;
};

export type TriggerType = {
  id: ModelId;
  sId: string;
  name: string;
  agentConfigurationId: AgentConfigurationType["sId"];
  editor: UserType["id"];
  customPrompt: string | null;
} & TriggerConfiguration;

export type TriggerKind = TriggerType["kind"];

export function isValidTriggerKind(kind: string): kind is TriggerKind {
  return ["schedule"].includes(kind);
}

const ScheduleConfigSchema = t.type({
  cron: t.string,
  timezone: t.string,
});

export const TriggerSchema = t.type({
  name: t.string,
  kind: t.literal("schedule"),
  configuration: ScheduleConfigSchema,
});
