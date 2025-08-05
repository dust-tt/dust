import type { Icon } from "@dust-tt/sparkle";
import { uniqueId } from "lodash";
import { z } from "zod";

import type {agentBuilderFormSchema} from "@app/components/agent_builder/AgentBuilderFormContext";
import { additionalConfigurationSchema, childAgentIdSchema, dustAppConfigurationSchema, jsonSchemaFieldSchema, jsonSchemaStringSchema, mcpServerViewIdSchema, mcpTimeFrameSchema, reasoningModelSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/formValidation";
import { dataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { DEFAULT_MCP_ACTION_NAME } from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { SupportedModel, WhitelistableFeature } from "@app/types";
import { ioTsEnum } from "@app/types";

type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = AgentBuilderFormData["actions"][number];

export type DataVisualizationAgentBuilderAction = Extract<
  AgentBuilderAction,
  { type: "DATA_VISUALIZATION" }
>;



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
  name: z
    .string()
    .min(1, "The name cannot be empty.")
    .regex(
      /^[a-z0-9_]+$/,
      "The name can only contain lowercase letters, numbers, and underscores (no spaces)."
    )
    .default(""),
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

// TODO: merge this with MCP form schema.
export const capabilityFormSchema = z.object({
    name: z
        .string()
        .min(1, "The name cannot be empty.")
        .regex(
          /^[a-z0-9_]+$/,
          "The name can only contain lowercase letters, numbers, and underscores (no spaces)."
        )
        .default(""),
  description: z
    .string()
    .min(1, "Description is required")
    .max(DESCRIPTION_MAX_LENGTH, "Description too long"),
  sources: dataSourceBuilderTreeType.refine(
    (val) => {
      return val.in.length > 0;
    },
    { message: "You must select at least on data sources" }
  ),
  mcpServerView: z.custom<MCPServerViewType>().nullable(),
  configuration: z.object({
     dataSourceConfigurations: dataSourceConfigurationSchema,
      tablesConfigurations: dataSourceConfigurationSchema,
      childAgentId: childAgentIdSchema,
      reasoningModel: reasoningModelSchema,
      timeFrame: mcpTimeFrameSchema,
      additionalConfiguration: additionalConfigurationSchema,
      dustAppConfiguration: dustAppConfigurationSchema,
      jsonSchema: jsonSchemaFieldSchema,
      _jsonSchemaString: jsonSchemaStringSchema,
  })
}).refine((val) => {
    const requirements = getMCPServerRequirements(val.mcpServerView);
    const configuration = val.configuration;
    
    if (!requirements) {
      return true;
    }

    // Handle data source configuration requirements
    if (requirements.requiresDataSourceConfiguration) {
      if (!configuration.dataSourceConfigurations || Object.keys(configuration.dataSourceConfigurations).length === 0) {
        return false;
      }
    }

    // Handle table configuration requirements
    if (requirements.requiresTableConfiguration) {
      if (!configuration.tablesConfigurations || Object.keys(configuration.tablesConfigurations).length === 0) {
        return false;
      }
    }

    if (requirements.requiresChildAgentConfiguration) {
      if (configuration.childAgentId === null) {
        return false;
      }
    }

    if (requirements.requiresReasoningConfiguration) {
      if (configuration.reasoningModel === null) {
        return false;
      }
    }

    if (requirements.requiresDustAppConfiguration) {
      if (configuration.dustAppConfiguration === null) {
        return false;
      }
    }

    // Handle time frame requirements
    if (requirements.mayRequireTimeFrameConfiguration) {
      if (configuration.timeFrame === null) {
        return false;
      }
    }

    // Handle JSON schema requirements
    if (requirements.mayRequireJsonSchemaConfiguration) {
      if (configuration.jsonSchema === null) {
        return false;
      }
      if (!configuration._jsonSchemaString || configuration._jsonSchemaString.trim() === "") {
        return false;
      }
    }

    if (
      requirements.requiredStrings.length > 0 ||
      requirements.requiredNumbers.length > 0 ||
      requirements.requiredBooleans.length > 0 ||
      Object.keys(requirements.requiredEnums).length > 0
    ) {
      const additionalConfig = configuration.additionalConfiguration || {};
      
      for (const key of requirements.requiredStrings) {
        if (!additionalConfig[key]) {
          return false;
        }
      }

      for (const key of requirements.requiredNumbers) {
        if (additionalConfig[key] === undefined) {
          return false;
        }
      }

      for (const key of requirements.requiredBooleans) {
        if (additionalConfig[key] === undefined) {
          return false;
        }
      }

      for (const [key] of Object.entries(requirements.requiredEnums)) {
        if (!additionalConfig[key]) {
          return false;
        }
      }
    }

    return true;
  }, {
    message: "Please fill in all required configuration fields"
  } 
);

export function getDefaultMCPAction(
  mcpServerView?: MCPServerViewType
): AgentBuilderAction {
  const requirements = getMCPServerRequirements(mcpServerView);
  const configuration = getDefaultConfiguration(mcpServerView);

  return {
    id: uniqueId(),
    type: "MCP",
    configuration,
    name: mcpServerView?.name ?? mcpServerView?.server.name ?? "",
    description:
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresTableConfiguration
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
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
