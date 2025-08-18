import { AgentConfigurationType } from "@app/types/assistant/agent";
import { UserType } from "@app/types/user";
import * as t from "io-ts";

export const TRIGGER_KINDS = ["schedule"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export type ScheduleConfigType = {
  cron: string;
  timezone: string;
};

export function isScheduleConfiguration(
  config: TriggerConfigType
): config is ScheduleConfigType {
  return (
    config !== null &&
    typeof config === "object" &&
    "cron" in config &&
    "timezone" in config
  );
}

export type TriggerConfigType = ScheduleConfigType | null;

export type TriggerType = {
  id: number;
  sId: string;

  name: string;
  description: string;

  agentConfigurationId: AgentConfigurationType["sId"];
  editor: UserType["id"];
  subscribers: UserType["id"][] | null;

  kind: TriggerKind;
  config: TriggerConfigType;

  customPrompt: string | null;
};

const TriggerKindCodec = t.literal("schedule");

const ScheduleConfigSchema = t.type({
  cron: t.string,
  timezone: t.string,
});

export const TriggerSchema = t.type({
  name: t.string,
  description: t.string,
  kind: TriggerKindCodec,
  config: t.union([ScheduleConfigSchema, t.undefined]),
});
