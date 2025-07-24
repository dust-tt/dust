import type { Icon } from "@dust-tt/sparkle";
import { uniqueId } from "lodash";
import { z } from "zod";

import type { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { DEFAULT_MCP_ACTION_NAME } from "@app/lib/actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SupportedModel, WhitelistableFeature } from "@app/types";
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
  "extract_data",
  "query_tables",
] as const;
export type AgentBuilderMCPServerName =
  (typeof AGENT_BUILDER_MCP_SERVERS)[number];

// Type for the supported action types that can be transformed from MCP server configurations
export type SupportedAgentBuilderActionType =
  | "EXTRACT_DATA"
  | "SEARCH"
  | "INCLUDE_DATA"
  | "QUERY_TABLES";

// Mapping of specific MCP server names to form action types
export const MCP_SERVER_TO_ACTION_TYPE_MAP: Record<
  AgentBuilderMCPServerName,
  SupportedAgentBuilderActionType
> = {
  extract_data: "EXTRACT_DATA",
  search: "SEARCH",
  include_data: "INCLUDE_DATA",
  query_tables: "QUERY_TABLES",
} as const;

export const ACTION_TYPE_TO_MCP_SERVER_MAP: Record<
  SupportedAgentBuilderActionType,
  AgentBuilderMCPServerName
> = {
  EXTRACT_DATA: "extract_data",
  SEARCH: "search",
  INCLUDE_DATA: "include_data",
  QUERY_TABLES: "query_tables",
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

export const DESCRIPTION_MAX_LENGTH = 800;

// TODO: use mcpFormSchema for all tools.
export const capabilityFormSchema = z.object({
  sources: z
    .object({
      in: z.string().array(),
      notIn: z.string().array(),
    })
    .refine(
      (val) => {
        return val.in.length > 0;
      },
      { message: "You must select at least on data sources" }
    ),
  description: z
    .string()
    .min(1, "Description is required")
    .max(DESCRIPTION_MAX_LENGTH, "Description too long"),
  timeFrame: z
    .object({
      duration: z.number(),
      unit: z.enum(["hour", "day", "week", "month", "year"]),
    })
    .nullable()
    .default(null),
  jsonSchema: z.any().nullable().default(null),
});

export const mcpFormSchema = z.object({
  configuration: z.object({
    mcpServerViewId: z.string(),
    dataSourceConfigurations: z.any().nullable().default(null),
    tablesConfigurations: z.any().nullable().default(null),
    childAgentId: z.string().nullable().default(null),
    reasoningModel: z.any().nullable().default(null),
    timeFrame: z
      .object({
        duration: z.number(),
        unit: z.enum(["hour", "day", "week", "month", "year"]),
      })
      .nullable()
      .default(null),
    additionalConfiguration: z
      .record(z.union([z.boolean(), z.number(), z.string()]))
      .default({}),
    dustAppConfiguration: z.any().nullable().default(null),
    jsonSchema: z.any().nullable().default(null),
    _jsonSchemaString: z.string().nullable().default(null),
  }),
  name: z.string().default(""),
  description: z
    .string()
    .min(1, "Description is required")
    .max(DESCRIPTION_MAX_LENGTH, "Description too long")
    .default(""),
});

export type CapabilityFormData = z.infer<typeof capabilityFormSchema>;

export const CONFIGURATION_SHEET_PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  CONFIGURATION: "configuration",
} as const;

export type ConfigurationSheetPageId =
  (typeof CONFIGURATION_SHEET_PAGE_IDS)[keyof typeof CONFIGURATION_SHEET_PAGE_IDS];

// Zod validation schema for data source configuration - defines the contract/shape
export const dataSourceConfigurationSchema = z.object({
  sId: z.string().optional(),
  workspaceId: z.string(),
  dataSourceViewId: z.string().min(1, "DataSourceViewId cannot be empty"),
  filter: z.object({
    parents: z
      .object({
        in: z.array(z.string()),
        not: z.array(z.string()),
      })
      .nullable(),
    tags: z
      .object({
        in: z.array(z.string()),
        not: z.array(z.string()),
        mode: z.enum(["custom", "auto"]),
      })
      .nullable()
      .optional(),
  }),
});

export function getDefaultMCPAction(
  mcpServerView?: MCPServerViewType
): AgentBuilderAction {
  const requirements = getMCPServerRequirements(mcpServerView);

  return {
    id: uniqueId(),
    type: "MCP",
    configuration: {
      mcpServerViewId: mcpServerView?.sId ?? "not-a-valid-sId",
      dataSourceConfigurations: null,
      tablesConfigurations: null,
      childAgentId: null,
      reasoningModel: null,
      timeFrame: null,
      additionalConfiguration: {},
      dustAppConfiguration: null,
      jsonSchema: null,
      _jsonSchemaString: null,
    },
    name: mcpServerView?.server.name ?? "",
    description:
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresTableConfiguration
        ? ""
        : mcpServerView?.server.description ?? "",
    noConfigurationRequired: requirements.noRequirement,
  };
}

export function isDefaultActionName(action: AgentBuilderAction) {
  return action.name.includes(DEFAULT_MCP_ACTION_NAME);
}

export interface ActionSpecification {
  label: string;
  description: string;
  dropDownIcon: NonNullable<React.ComponentProps<typeof Icon>["visual"]>;
  cardIcon: NonNullable<React.ComponentProps<typeof Icon>["visual"]>;
  flag: WhitelistableFeature | null;
}
