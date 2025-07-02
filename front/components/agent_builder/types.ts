import type { z } from "zod";

import type { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SupportedModel } from "@app/types";
import { ioTsEnum } from "@app/types";

type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = AgentBuilderFormData["actions"][number];

export type SearchAgentBuilderAction = Extract<
  AgentBuilderAction,
  { type: "SEARCH" }
>;

export type DataVisualizationAgentBuilderAction = Extract<
  AgentBuilderAction,
  { type: "DATA_VISUALIZATION" }
>;

export type IncludeDataAgentBuilderAction = Extract<
  AgentBuilderAction,
  { type: "INCLUDE_DATA" }
>;

export type SearchActionConfiguration =
  SearchAgentBuilderAction["configuration"];

export type DataVisualizationActionConfiguration =
  DataVisualizationAgentBuilderAction["configuration"];

export type IncludeDataActionConfiguration =
  IncludeDataAgentBuilderAction["configuration"];

export type AgentBuilderActionConfiguration =
  | SearchActionConfiguration
  | DataVisualizationActionConfiguration
  | IncludeDataActionConfiguration;

// Type guards
export function isSearchAction(
  action: AgentBuilderAction
): action is SearchAgentBuilderAction {
  return action.type === "SEARCH";
}

export function isDataVisualizationAction(
  action: AgentBuilderAction
): action is DataVisualizationAgentBuilderAction {
  return action.type === "DATA_VISUALIZATION";
}

export function isIncludeDataAction(
  action: AgentBuilderAction
): action is IncludeDataAgentBuilderAction {
  return action.type === "INCLUDE_DATA";
}

// Knowledge server names that require configuration sheets
export const KNOWLEDGE_SERVER_NAMES = ["search", "include_data"] as const;
export type KnowledgeServerName = (typeof KNOWLEDGE_SERVER_NAMES)[number];

export function isKnowledgeServerName(
  serverName: string
): serverName is KnowledgeServerName {
  return KNOWLEDGE_SERVER_NAMES.includes(serverName as KnowledgeServerName);
}

export const AGENT_CREATIVITY_LEVELS = [
  "deterministic",
  "factual",
  "balanced",
  "creative",
] as const;
export type AgentCreativityLevel = (typeof AGENT_CREATIVITY_LEVELS)[number];
export const AgentCreativityLevelCodec = ioTsEnum<AgentCreativityLevel>(
  AGENT_CREATIVITY_LEVELS,
  "AgentCreativityLevel"
);
export const AGENT_CREATIVITY_LEVEL_DISPLAY_NAMES = {
  deterministic: "Deterministic",
  factual: "Factual",
  balanced: "Balanced",
  creative: "Creative",
} as const;
export const AGENT_CREATIVITY_LEVEL_TEMPERATURES: Record<
  AgentCreativityLevel,
  number
> = {
  deterministic: 0.0,
  factual: 0.2,
  balanced: 0.7,
  creative: 1.0,
};

export type GenerationSettingsType = {
  modelSettings: SupportedModel;
  temperature: number;
  responseFormat?: string;
};

export const BUILDER_FLOWS = [
  "workspace_assistants",
  "personal_assistants",
] as const;
export type BuilderFlow = (typeof BUILDER_FLOWS)[number];
