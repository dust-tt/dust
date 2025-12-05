import type { Icon } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import uniqueId from "lodash/uniqueId";
import type { ComponentProps } from "react";
import { z } from "zod";

import type { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { mcpServerConfigurationSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { nameToStorageFormat } from "@app/components/agent_builder/capabilities/mcp/utils/actionNameUtils";
import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { dataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { DEFAULT_MCP_ACTION_NAME } from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import type {
  DataSourceViewSelectionConfigurations,
  DustAppRunConfigurationType,
  ReasoningModelConfigurationType,
  TimeFrame,
  WhitelistableFeature,
} from "@app/types";

type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = AgentBuilderFormData["actions"][number];

export const BUILDER_FLOWS = [
  "workspace_assistants",
  "personal_assistants",
] as const;
export type BuilderFlow = (typeof BUILDER_FLOWS)[number];

export const DESCRIPTION_MAX_LENGTH = 800;

export type CapabilityFormData = z.infer<typeof capabilityFormSchema>;

export const CONFIGURATION_SHEET_PAGE_IDS = {
  DATA_SOURCE_SELECTION: "data-source-selection",
  CONFIGURATION: "configuration",
} as const;

export const TOOLS_SHEET_PAGE_IDS = {
  TOOL_SELECTION: "tool-selection",
  CONFIGURATION: "configuration",
  INFO: "info",
};

export type ConfigurationPagePageId =
  (typeof TOOLS_SHEET_PAGE_IDS)[keyof typeof TOOLS_SHEET_PAGE_IDS];

// TODO: merge this with MCP form schema. Right now it only validates two fields.
export const capabilityFormSchema = z
  .object({
    name: z
      .string()
      .min(1, "The name cannot be empty.")
      .transform((val) => {
        // Convert to lowercase and replace spaces and special chars with underscores
        return (
          val
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, "_")
            // Remove consecutive underscores
            .replace(/_+/g, "_")
            // Remove leading/trailing underscores
            .replace(/^_+|_+$/g, "")
        );
      })
      .default(""),
    description: z
      .string()
      .min(1, "Description is required")
      .max(
        DESCRIPTION_MAX_LENGTH,
        "Description should be less than 800 characters."
      ),
    sources: dataSourceBuilderTreeType.refine(
      (val) => {
        return val.in.length > 0;
      },
      { message: "You must select at least on data sources" }
    ),
    mcpServerView: z.custom<MCPServerViewType>().nullable(),
    configuration: mcpServerConfigurationSchema,
  })
  .superRefine((val, ctx) => {
    const {
      mayRequireTimeFrameConfiguration,
      mayRequireJsonSchemaConfiguration,
    } = getMCPServerRequirements(val.mcpServerView);
    const configuration = val.configuration;

    if (mayRequireTimeFrameConfiguration) {
      if (
        configuration.timeFrame !== null &&
        (configuration.timeFrame.duration === null ||
          configuration.timeFrame.unit === null)
      ) {
        return ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["configuration.timeFrame"],
          message:
            "You must use time frame between that and that when you have required enums in mcpServerViews.",
        });
      }
    }

    if (
      mayRequireJsonSchemaConfiguration &&
      configuration._jsonSchemaString !== null
    ) {
      const parsedSchema = validateConfiguredJsonSchema(
        configuration._jsonSchemaString
      );

      if (parsedSchema.isErr()) {
        return ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["configuration.jsonSchema"],
          message: parsedSchema.error.message,
        });
      }
    }

    return true;
  });

export function getDefaultMCPAction(
  mcpServerView?: MCPServerViewType
): AgentBuilderAction {
  const {
    requiresDataSourceConfiguration,
    requiresDataWarehouseConfiguration,
    requiresTableConfiguration,
    noRequirement,
  } = getMCPServerRequirements(mcpServerView);
  const configuration = getDefaultConfiguration(mcpServerView);
  const rawName = mcpServerView?.name ?? mcpServerView?.server.name ?? "";
  const sanitizedName = rawName ? nameToStorageFormat(rawName) : "";

  return {
    id: uniqueId(),
    type: "MCP",
    configuration,
    // Ensure default name always matches validation regex (^[a-z0-9_]+$)
    name: sanitizedName,
    description:
      requiresDataSourceConfiguration ||
      requiresDataWarehouseConfiguration ||
      requiresTableConfiguration
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
    configurationRequired: !noRequirement,
  };
}

export function isDefaultActionName(action: AgentBuilderAction) {
  return action.name.includes(DEFAULT_MCP_ACTION_NAME);
}

export interface ActionSpecification {
  label: string;
  description: string;
  dropDownIcon: NonNullable<ComponentProps<typeof Icon>["visual"]>;
  cardIcon: NonNullable<ComponentProps<typeof Icon>["visual"]>;
  flag: WhitelistableFeature | null;
}

// MCP configuration types used by the agent builder.
type AgentBuilderMCPServerConfiguration = {
  mcpServerViewId: string;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations | null;
  tablesConfigurations: DataSourceViewSelectionConfigurations | null;
  childAgentId: string | null;
  reasoningModel: ReasoningModelConfigurationType | null;
  timeFrame: TimeFrame | null;
  additionalConfiguration: AdditionalConfigurationType;
  dustAppConfiguration: DustAppRunConfigurationType | null;
  jsonSchema: JSONSchema | null;
  _jsonSchemaString: string | null;
  secretName: string | null;
};

export type AgentBuilderMCPConfiguration = {
  type: "MCP";
  configuration: AgentBuilderMCPServerConfiguration;
  name: string;
  description: string;
  configurationRequired?: boolean;
};

export type AgentBuilderMCPConfigurationWithId =
  AgentBuilderMCPConfiguration & {
    id: string;
  };

export function getDefaultMCPServerActionConfiguration(
  mcpServerView?: MCPServerViewType
): AgentBuilderMCPConfiguration {
  const requirements = getMCPServerRequirements(mcpServerView);

  return {
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
      secretName: null,
    },
    name: mcpServerView?.name ?? mcpServerView?.server.name ?? "",
    description:
      requirements.requiresDataSourceConfiguration ||
      requirements.requiresDataWarehouseConfiguration ||
      requirements.requiresTableConfiguration
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
    configurationRequired: !requirements.noRequirement,
  };
}
