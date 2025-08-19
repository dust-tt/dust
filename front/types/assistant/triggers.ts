import { AgentConfigurationType } from "@app/types/assistant/agent";
import { ModelId } from "@app/types/shared/model_id";
import { UserType } from "@app/types/user";

export type ScheduleConfig = {
  cron: string;
  timezone: string;
};

export type WebhookConfig = {
  url: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
};

export type TriggerConfiguration =
  | { kind: "schedule"; config: ScheduleConfig }
  | { kind: "webhook"; config: WebhookConfig };

export type TriggerType = {
  id: ModelId;
  sId: string;
  name: string;
  description: string;
  agentConfigurationId: AgentConfigurationType["id"];
  editor: UserType["id"];
  customPrompt: string | null;
} & TriggerConfiguration;

export type TriggerKind = TriggerType["kind"];

export function isValidTriggerKind(kind: string): kind is TriggerKind {
  return ["schedule", "webhook"].includes(kind);
}
