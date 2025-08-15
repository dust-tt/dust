import { AgentConfigurationType } from "@app/types/assistant/agent";
import { UserType } from "@app/types/user";
import * as t from "io-ts";

export const TRIGGER_KINDS = ["schedule"] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export type ScheduleConfigType = {
  cron: string;
  timezone: string;
};

export type TriggerConfigType = ScheduleConfigType;

// Full database representation
export type DatabaseTriggerType = {
  id: number;
  sId: string;

  name: string;
  description: string;

  agentConfigurationId: AgentConfigurationType["id"];
  editor: UserType["id"];
  subscribers: UserType["id"][] | null;

  kind: TriggerKind;
  config: TriggerConfigType | null;

  customPrompt: string | null;
};

// Main type for API and UI (what components expect)
export type TriggerType = {
  sId?: string;
  name: string;
  description: string;
  kind: TriggerKind;
  config?: TriggerConfigType | null;
};

// Type for API operations (create/update)
export type CreateTriggerType = {
  name: string;
  description: string;
  kind: TriggerKind;
  config?: TriggerConfigType | null;
};

export type UpdateTriggerType = CreateTriggerType;

const TriggerKindCodec = t.keyof({
  schedule: null,
});

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
