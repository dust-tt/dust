import { AgentConfigurationType } from "@app/types/assistant/agent";
import { ModelId } from "@app/types/shared/model_id";
import { UserType } from "@app/types/user";
import * as t from "io-ts";

export type ScheduleConfig = {
  cron: string;
  timezone: string;
};

export type TriggerConfigurationType = ScheduleConfig;

export type TriggerConfiguration = { kind: "schedule"; config: ScheduleConfig };

export type TriggerType = {
  id: ModelId;
  sId: string;
  name: string;
  description: string;
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
  description: t.string,
  kind: t.literal("schedule"),
  config: ScheduleConfigSchema,
});
