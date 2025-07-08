import type { z } from "zod";
import { z as zod } from "zod";

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

export type ExtractDataAgentBuilderAction = Extract<
  AgentBuilderAction,
  { type: "EXTRACT_DATA" }
>;

export type SearchActionConfiguration =
  SearchAgentBuilderAction["configuration"];

export type DataVisualizationActionConfiguration =
  DataVisualizationAgentBuilderAction["configuration"];

export type IncludeDataActionConfiguration =
  IncludeDataAgentBuilderAction["configuration"];

export type ExtractDataActionConfiguration =
  ExtractDataAgentBuilderAction["configuration"];

export type AgentBuilderActionConfiguration =
  | SearchActionConfiguration
  | DataVisualizationActionConfiguration
  | IncludeDataActionConfiguration
  | ExtractDataActionConfiguration;

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

export function isExtractDataAction(
  action: AgentBuilderAction
): action is ExtractDataAgentBuilderAction {
  return action.type === "EXTRACT_DATA";
}

// MCP server names that map to agent builder actions
export const AGENT_BUILDER_MCP_SERVERS = [
  "extract_data",
  "search",
  "include_data",
] as const;
export type AgentBuilderMCPServerName =
  (typeof AGENT_BUILDER_MCP_SERVERS)[number];

// Type for the supported action types that can be transformed from MCP server configurations
export type SupportedAgentBuilderActionType =
  | "EXTRACT_DATA"
  | "SEARCH"
  | "INCLUDE_DATA";

// Mapping of specific MCP server names to form action types
export const MCP_SERVER_TO_ACTION_TYPE_MAP: Record<
  AgentBuilderMCPServerName,
  SupportedAgentBuilderActionType
> = {
  extract_data: "EXTRACT_DATA",
  search: "SEARCH",
  include_data: "INCLUDE_DATA",
} as const;

// Legacy alias for backward compatibility
export const KNOWLEDGE_SERVER_NAMES = AGENT_BUILDER_MCP_SERVERS;
export type KnowledgeServerName = AgentBuilderMCPServerName;

export function isKnowledgeServerName(
  serverName: string
): serverName is KnowledgeServerName {
  return AGENT_BUILDER_MCP_SERVERS.includes(
    serverName as AgentBuilderMCPServerName
  );
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

// Zod validation schema for data source configuration - defines the contract/shape
export const dataSourceConfigurationSchema = zod.object({
  sId: zod.string().optional(),
  workspaceId: zod.string(),
  dataSourceViewId: zod.string().min(1, "DataSourceViewId cannot be empty"),
  filter: zod.object({
    parents: zod
      .object({
        in: zod.array(zod.string()),
        not: zod.array(zod.string()),
      })
      .nullable(),
    tags: zod
      .object({
        in: zod.array(zod.string()),
        not: zod.array(zod.string()),
        mode: zod.enum(["custom", "auto"]),
      })
      .nullable()
      .optional(),
  }),
});
