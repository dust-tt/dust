import type {
  SupportedModel,
  DataSourceViewSelectionConfigurations,
} from "@app/types";
import { ioTsEnum } from "@app/types";

// ===== Agent Builder Action Types =====

// Search Action Configuration
export interface SearchActionConfiguration {
  type: "SEARCH";
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
}

// Data Visualization Action Configuration
export interface DataVisualizationActionConfiguration {
  type: "DATA_VISUALIZATION";
}

// Union of all action configurations
export type AgentBuilderActionConfiguration =
  | SearchActionConfiguration
  | DataVisualizationActionConfiguration;

// Base Agent Builder Action
export interface BaseAgentBuilderAction {
  id: string;
  name: string;
  description: string;
  noConfigurationRequired: boolean;
}

// Search Action
export interface SearchAgentBuilderAction extends BaseAgentBuilderAction {
  type: "SEARCH";
  configuration: SearchActionConfiguration;
}

// Data Visualization Action
export interface DataVisualizationAgentBuilderAction
  extends BaseAgentBuilderAction {
  type: "DATA_VISUALIZATION";
  configuration: DataVisualizationActionConfiguration;
}

// Union of all agent builder actions
export type AgentBuilderAction =
  | SearchAgentBuilderAction
  | DataVisualizationAgentBuilderAction;

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

// Knowledge server names that require configuration sheets
export const KNOWLEDGE_SERVER_NAMES = ["search"] as const;
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
