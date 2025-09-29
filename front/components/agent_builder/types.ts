import type { Icon } from "@dust-tt/sparkle";
import uniqueId from "lodash/uniqueId";
import { z } from "zod";

import type { agentBuilderFormSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { mcpServerConfigurationSchema } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDefaultConfiguration } from "@app/components/agent_builder/capabilities/mcp/utils/formDefaults";
import { dataSourceBuilderTreeType } from "@app/components/data_source_view/context/types";
import { DEFAULT_MCP_ACTION_NAME } from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { WhitelistableFeature } from "@app/types";

type AgentBuilderFormData = z.infer<typeof agentBuilderFormSchema>;

export type AgentBuilderAction = AgentBuilderFormData["actions"][number];

const AGENT_CREATIVITY_LEVELS = [
  "deterministic",
  "factual",
  "balanced",
  "creative",
] as const;
export type AgentCreativityLevel = (typeof AGENT_CREATIVITY_LEVELS)[number];

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
    const toolsConfigurations = getMCPServerToolsConfigurations(
      val.mcpServerView
    );
    const configuration = val.configuration;

    if (!toolsConfigurations) {
      return true;
    }

    if (toolsConfigurations.mayRequireTimeFrameConfiguration) {
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
      toolsConfigurations.mayRequireJsonSchemaConfiguration &&
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
  const toolsConfigurations = getMCPServerToolsConfigurations(mcpServerView);
  const configuration = getDefaultConfiguration(mcpServerView);

  return {
    id: uniqueId(),
    type: "MCP",
    configuration,
    name: mcpServerView?.name ?? mcpServerView?.server.name ?? "",
    description:
      toolsConfigurations.dataSourceConfiguration ??
      toolsConfigurations.dataWarehouseConfiguration ??
      toolsConfigurations.tableConfiguration ??
      false
        ? ""
        : mcpServerView
          ? getMcpServerViewDescription(mcpServerView)
          : "",
    configurable: toolsConfigurations.configurable !== "no",
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
