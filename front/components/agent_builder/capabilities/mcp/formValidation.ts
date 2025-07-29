import { z } from "zod";

import type { MCPServerConfigurationType } from "@app/components/agent_builder/AgentBuilderFormContext";
import {
  additionalConfigurationSchema,
  childAgentIdSchema,
  dustAppConfigurationSchema,
  jsonSchemaFieldSchema,
  jsonSchemaStringSchema,
  mcpServerViewIdSchema,
  mcpTimeFrameSchema,
  reasoningModelSchema,
  tablesConfigurationsSchema} from "@app/components/agent_builder/AgentBuilderFormContext";
import type { MCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";

const createConfigSchema = (requirements: MCPServerRequirements | null) => {
  const baseFields = {
    mcpServerViewId: mcpServerViewIdSchema,
    timeFrame: mcpTimeFrameSchema,
    jsonSchema: jsonSchemaFieldSchema,
    _jsonSchemaString: jsonSchemaStringSchema,
  };

  if (!requirements) {
    return z.object({
      ...baseFields,
      dataSourceConfigurations: z.any().nullable().default(null), // TODO: fixme
      tablesConfigurations: tablesConfigurationsSchema,
      childAgentId: childAgentIdSchema,
      reasoningModel: reasoningModelSchema,
      dustAppConfiguration: dustAppConfigurationSchema,
    });
  }

  const dynamicFields: Record<string, z.ZodSchema> = {};

  if (requirements.requiresChildAgentConfiguration) {
    dynamicFields.childAgentId = childAgentIdSchema.refine(
      (val) => val !== null,
      {
        message: "Child agent selection is required",
      }
    );
  } else {
    dynamicFields.childAgentId = z.null();
  }

  if (requirements.requiresReasoningConfiguration) {
    dynamicFields.reasoningModel = reasoningModelSchema.refine(
      (val) => val !== null,
      {
        message: "Reasoning model configuration is required",
      }
    );
  } else {
    dynamicFields.reasoningModel = z.null();
  }

  if (requirements.requiresDustAppConfiguration) {
    dynamicFields.dustAppConfiguration = dustAppConfigurationSchema.refine(
      (val) => val !== null,
      {
        message: "Please select a Dust app",
      }
    );
  } else {
    dynamicFields.dustAppConfiguration = z.null();
  }

  if (
    requirements.requiredStrings.length > 0 ||
    requirements.requiredNumbers.length > 0 ||
    requirements.requiredBooleans.length > 0 ||
    Object.keys(requirements.requiredEnums).length > 0
  ) {
    dynamicFields.additionalConfiguration = additionalConfigurationSchema
      .default({})
      .refine(
        (additionalConfig) => {
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

          for (const key of Object.keys(requirements.requiredEnums)) {
            if (!additionalConfig[key]) {
              return false;
            }
          }

          return true;
        },
        {
          message: "All required configuration fields must be filled",
        }
      );
  } else {
    dynamicFields.additionalConfiguration =
      additionalConfigurationSchema.default({});
  }

  const configSchema = z.object({
    ...baseFields,
    ...dynamicFields,
  });

  return configSchema;
};

// All MCP actions have the same config structure, but required fields are different and we need to determine them from mcpServerView.
export function getMCPConfigurationFormSchema(
  mcpServerView: MCPServerViewType | null | undefined
) {
  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  return z.object({
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
      .max(800, "Description too long"),
    configuration: createConfigSchema(requirements),
  });
}

export function getDefaultConfiguration(
  mcpServerView: MCPServerViewType | null | undefined
) {
  const requirements = mcpServerView
    ? getMCPServerRequirements(mcpServerView)
    : null;

  const defaults: MCPServerConfigurationType = {
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
  };

  if (!requirements) {
    return defaults;
  }

  const additionalConfig: Record<string, boolean | number | string> = {};

  for (const key of requirements.requiredBooleans) {
    additionalConfig[key] = false;
  }

  for (const [key, enumValues] of Object.entries(requirements.requiredEnums)) {
    if (enumValues.length > 0) {
      additionalConfig[key] = enumValues[0];
    }
  }

  defaults.additionalConfiguration = additionalConfig;

  return defaults;
}
