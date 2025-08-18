import { isArray } from "lodash";
import { z } from "zod";

import {
  additionalConfigurationSchema,
  childAgentIdSchema,
  dataSourceConfigurationSchema,
  dustAppConfigurationSchema,
  jsonSchemaFieldSchema,
  jsonSchemaStringSchema,
  mcpServerViewIdSchema,
  mcpTimeFrameSchema,
  reasoningModelSchema,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { VALIDATION_MESSAGES } from "@app/components/agent_builder/capabilities/mcp/utils/validationMessages";
import type { MCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";

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
  requirements: MCPServerRequirements
) {
  return {
    childAgentId: requirements.requiresChildAgentConfiguration
      ? childAgentIdSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.childAgent.required,
        })
      : z.null(),
    reasoningModel: requirements.requiresReasoningConfiguration
      ? reasoningModelSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.reasoningModel.required,
        })
      : z.null(),
    dustAppConfiguration: requirements.requiresDustAppConfiguration
      ? dustAppConfigurationSchema.refine((val) => val !== null, {
          message: VALIDATION_MESSAGES.dustApp.required,
        })
      : z.null(),
    additionalConfiguration: createAdditionalConfigurationSchema(requirements),
  };
}

/**
 * Creates additional configuration validation schema
 * Handles dynamic field validation based on requirements
 */
function createAdditionalConfigurationSchema(
  requirements: MCPServerRequirements
) {
  const hasRequiredFields =
    requirements.requiredStrings.length > 0 ||
    requirements.requiredNumbers.length > 0 ||
    requirements.requiredBooleans.length > 0 ||
    Object.keys(requirements.requiredEnums).length > 0 ||
    Object.keys(requirements.requiredLists).length > 0;

  if (!hasRequiredFields) {
    return additionalConfigurationSchema.default({});
  }

  return additionalConfigurationSchema
    .default({})
    .superRefine((additionalConfig, ctx) => {
      // Validate required strings
      for (const key of requirements.requiredStrings) {
        const value = additionalConfig[key];
        if (!value || (typeof value === "string" && value.trim() === "")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: VALIDATION_MESSAGES.additionalConfig.stringRequired(key),
            path: [key],
          });
        }
      }

      // Validate required numbers
      for (const key of requirements.requiredNumbers) {
        if (
          additionalConfig[key] === undefined ||
          additionalConfig[key] === null
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: VALIDATION_MESSAGES.additionalConfig.numberRequired(key),
            path: [key],
          });
        }
      }

      // Validate required booleans
      for (const key of requirements.requiredBooleans) {
        if (
          additionalConfig[key] === undefined ||
          additionalConfig[key] === null
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: VALIDATION_MESSAGES.additionalConfig.booleanRequired(key),
            path: [key],
          });
        }
      }

      // Validate required enums
      for (const [key] of Object.entries(requirements.requiredEnums)) {
        const value = additionalConfig[key];
        if (!value || (typeof value === "string" && value.trim() === "")) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: VALIDATION_MESSAGES.additionalConfig.enumRequired(key),
            path: [key],
          });
        }
      }

      // Validate required lists
      for (const [key] of Object.entries(requirements.requiredLists)) {
        const value = additionalConfig[key];
        if (!value || !isArray(value) || value.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: VALIDATION_MESSAGES.additionalConfig.listRequired(key),
            path: [key],
          });
        }
      }
    });
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
    additionalConfiguration: additionalConfigurationSchema,
  });
}

/**
 * Creates configuration schema with field-specific validation
 * @param requirements - MCP server requirements or null for default schema
 * @returns Configuration validation schema
 */
export function createConfigurationSchema(
  requirements: MCPServerRequirements | null
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
  requirements: MCPServerRequirements | null
) {
  const baseFormSchema = createBaseFormSchema();
  const configurationSchema = createConfigurationSchema(requirements);

  return z.object({
    ...baseFormSchema,
    configuration: configurationSchema,
  });
}
