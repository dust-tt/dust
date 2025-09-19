import { z } from "zod";

import {
  childAgentIdSchema,
  dataSourceConfigurationSchema,
  dustAppConfigurationSchema,
  jsonSchemaFieldSchema,
  jsonSchemaStringSchema,
  mcpServerViewIdSchema,
  mcpTimeFrameSchema,
  reasoningModelSchema,
  secretNameSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { VALIDATION_MESSAGES } from "@app/components/agent_builder/capabilities/mcp/utils/validationMessages";
import type { MCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";

/**
 * Creates base form validation schema with consistent error messages
 * Contains common fields that are present in all MCP forms
 */
export function createBaseFormSchema() {
  return {
    name: z
      .string()
      .min(1, VALIDATION_MESSAGES.name.empty)
      .regex(/^[a-z0-9_]+$/, VALIDATION_MESSAGES.name.format)
      .default(""),
    description: z
      .string()
      .min(1, VALIDATION_MESSAGES.description.required)
      .max(800, VALIDATION_MESSAGES.description.tooLong),
  };
}

/**
 * Creates base configuration schema fields that are always present
 * These fields are common to all MCP configurations regardless of requirements
 */
export function createBaseConfigurationFields() {
  return {
    mcpServerViewId: mcpServerViewIdSchema,
    dataSourceConfigurations: dataSourceConfigurationSchema,
    tablesConfigurations: dataSourceConfigurationSchema,
    timeFrame: mcpTimeFrameSchema,
    jsonSchema: jsonSchemaFieldSchema,
    _jsonSchemaString: jsonSchemaStringSchema,
  };
}

/**
 * Creates dynamic configuration fields based on MCP server requirements
 * Uses direct conditional logic for clarity
 */
export function createDynamicConfigurationFields(
  toolsConfigurations: MCPServerToolsConfigurations
) {
  return {
    childAgentId: toolsConfigurations.childAgentConfiguration
      ? childAgentIdSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.childAgent.required,
        })
      : z.null(),
    reasoningModel: toolsConfigurations.reasoningConfiguration
      ? reasoningModelSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.reasoningModel.required,
        })
      : z.null(),
    dustAppConfiguration: toolsConfigurations.mayRequireDustAppConfiguration
      ? dustAppConfigurationSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.dustApp.required,
        })
      : z.null(),
    secretName: toolsConfigurations.mayRequireSecretConfiguration
      ? secretNameSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.secret.required,
        })
      : z.null(),
    additionalConfiguration: createAdditionalConfigurationSchema(toolsConfigurations),
  };
}

/**
 * Creates additional configuration validation schema
 * Handles dynamic field validation based on requirements
 */
function createAdditionalConfigurationSchema(
  toolsConfigurations: MCPServerToolsConfigurations
) {
  const hasRequiredFields =
    toolsConfigurations.stringConfigurations.length > 0 ||
    toolsConfigurations.numberConfigurations.length > 0 ||
    toolsConfigurations.booleanConfigurations.length > 0 ||
    Object.keys(toolsConfigurations.enumConfigurations).length > 0 ||
    Object.keys(toolsConfigurations.listConfigurations).length > 0;

  if (!hasRequiredFields) {
    return z.object({});
  }

  // Build a schema dynamically based on the requirements.
  // We must take into account the nested structure of the additional configuration.

  // Build a dynamic schema that handles nested structure
  const buildNestedSchema = (keys: string[], prefix?: string): z.ZodSchema => {
    const nestedStructure: Record<string, any> = {};

    // Group keys by their root level
    const rootKeys = new Set<string>();
    const nestedKeys: Record<string, string[]> = {};

    keys.forEach((key) => {
      const parts = key.split(".");
      const rootKey = parts[0];
      rootKeys.add(rootKey);

      if (parts.length > 1) {
        if (!nestedKeys[rootKey]) {
          nestedKeys[rootKey] = [];
        }
        nestedKeys[rootKey].push(parts.slice(1).join("."));
      }
    });

    // Build schema for each root key
    rootKeys.forEach((rootKey) => {
      const path = prefix ? `${prefix}.${rootKey}` : rootKey;
      if (nestedKeys[rootKey] && nestedKeys[rootKey].length > 0) {
        // This is a nested object
        nestedStructure[rootKey] = buildNestedSchema(nestedKeys[rootKey], path);
      } else {
        // This is a leaf value - determine type based on requirements
        if (
          toolsConfigurations.stringConfigurations.some((item) => item.key === path)
        ) {
          nestedStructure[rootKey] = z.string().min(1);
        } else if (
          toolsConfigurations.numberConfigurations.some((item) => item.key === path)
        ) {
          nestedStructure[rootKey] = z.coerce.number();
        } else if (
          toolsConfigurations.booleanConfigurations.some((item) => item.key === path)
        ) {
          nestedStructure[rootKey] = z.coerce.boolean();
        } else if (toolsConfigurations.enumConfigurations[path]) {
          nestedStructure[rootKey] = z.enum(
            toolsConfigurations.enumConfigurations[path].options as [
              string,
              ...string[],
            ]
          );
        } else if (toolsConfigurations.listConfigurations[rootKey]) {
          nestedStructure[rootKey] = z
            .array(z.string())
            .min(1, `You must select at least one value for "${rootKey}"`);
        }
      }
    });

    return z.object(nestedStructure);
  };

  return buildNestedSchema([
    ...toolsConfigurations.stringConfigurations.map((item) => item.key),
    ...toolsConfigurations.numberConfigurations.map((item) => item.key),
    ...toolsConfigurations.booleanConfigurations.map((item) => item.key),
    ...Object.keys(toolsConfigurations.enumConfigurations),
    ...Object.keys(toolsConfigurations.listConfigurations),
  ]);
}

/**
 * Creates default configuration schema when no requirements are available
 * Fallback schema that accepts all possible fields
 */
export function createDefaultConfigurationSchema() {
  return z.object({
    ...createBaseConfigurationFields(),
    childAgentId: childAgentIdSchema,
    reasoningModel: reasoningModelSchema,
    dustAppConfiguration: dustAppConfigurationSchema,
    additionalConfiguration: z.object({}),
  });
}

/**
 * Creates configuration schema with field-specific validation
 * @param requirements - MCP server requirements or null for default schema
 * @returns Configuration validation schema
 */
export function createConfigurationSchema(
  requirements: MCPServerToolsConfigurations | null
) {
  const baseFields = createBaseConfigurationFields();

  if (!requirements) {
    return createDefaultConfigurationSchema();
  }

  // Build dynamic fields using validation factories
  const dynamicFields = createDynamicConfigurationFields(requirements);

  return z.object({
    ...baseFields,
    ...dynamicFields,
  });
}

/**
 * Creates complete MCP form schema with base form fields and configuration
 * @param requirements - MCP server requirements or null for default
 * @returns Complete form validation schema
 */
export function createMCPFormSchema(
  requirements: MCPServerToolsConfigurations | null
) {
  const baseFormSchema = createBaseFormSchema();
  const configurationSchema = createConfigurationSchema(requirements);

  return z.object({
    ...baseFormSchema,
    configuration: configurationSchema,
  });
}
