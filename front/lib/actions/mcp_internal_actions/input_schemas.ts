import type { InternalConfigurationMimeType } from "@dust-tt/client";
import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Ajv } from "ajv";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPActionConfiguration } from "@app/lib/actions/types/guards";
import { makeSId } from "@app/lib/resources/string_ids";
import {
  containsSubSchema,
  findSchemaAtPath,
  isJSONSchema,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WorkspaceType } from "@app/types";

/**
 * Mapping between the mime types we used to identify a configurable resource and the Zod schema used to validate it.
 */
export const ConfigurableToolInputSchemas: Record<
  InternalConfigurationMimeType,
  z.ZodSchema
> = {
  [INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE]: z.array(
    z.object({
      uri: z
        .string()
        .regex(
          /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/
        ),
      mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
    })
  ),
} as const;

const ConfigurableToolInputJSONSchemas = Object.fromEntries(
  Object.entries(ConfigurableToolInputSchemas).map(([key, schema]) => [
    key,
    zodToJsonSchema(schema),
  ])
) as Record<InternalConfigurationMimeType, JSONSchema>;

function generateConfiguredInput({
  actionConfiguration,
  owner,
  mimeType,
}: {
  owner: WorkspaceType;
  actionConfiguration: MCPToolConfigurationType;
  mimeType: InternalConfigurationMimeType;
}) {
  switch (mimeType) {
    case INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE:
      return (
        actionConfiguration.dataSourceConfigurations?.map((config) => ({
          uri: `data_source_configuration://dust/w/${owner.sId}/data_source_configurations/${makeSId(
            "data_source_configuration",
            {
              id: config.id,
              workspaceId: config.workspaceId,
            }
          )}`,
          mimeType,
        })) || []
      );
    default:
      assertNever(mimeType);
  }
}

/**
 * Checks if a server requires internal configuration by examining if any tool's inputSchema
 * contains the specified mimeType.
 */
export function serverRequiresInternalConfiguration({
  serverMetadata,
  mimeType,
}: {
  serverMetadata: MCPServerType;
  mimeType: InternalConfigurationMimeType;
}): boolean {
  return (
    serverMetadata?.tools?.some(
      (tool) =>
        tool?.inputSchema &&
        containsSubSchema(
          tool.inputSchema,
          ConfigurableToolInputJSONSchemas[mimeType]
        )
    ) ?? false
  );
}

/**
 * Recursively filters out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION.
 * This function handles nested objects and arrays.
 */
export function hideInternalConfiguration(inputSchema: JSONSchema): JSONSchema {
  const filteredSchema = { ...inputSchema };

  // Filter properties
  if (filteredSchema.properties) {
    const filteredProperties: JSONSchema["properties"] = {};
    const removedRequiredProps: string[] = [];

    for (const [key, value] of Object.entries(filteredSchema.properties)) {
      let shouldInclude = true;

      if (isJSONSchema(value)) {
        // Check if this property has a matching mimeType
        for (const schema of Object.values(ConfigurableToolInputJSONSchemas)) {
          if (containsSubSchema(value, schema)) {
            shouldInclude = false;
            // Track removed properties that were required
            if (filteredSchema.required?.includes(key)) {
              removedRequiredProps.push(key);
            }
            break;
          }
        }

        if (shouldInclude) {
          // Recursively filter nested properties
          filteredProperties[key] = hideInternalConfiguration(value);
        }
      } else if (value !== null && value !== undefined) {
        // Keep non-object values as is
        filteredProperties[key] = value;
      }
    }

    filteredSchema.properties = filteredProperties;

    // Update required properties if any were removed
    if (removedRequiredProps.length > 0 && filteredSchema.required) {
      filteredSchema.required = filteredSchema.required.filter(
        (prop) => !removedRequiredProps.includes(prop)
      );
    }
  }

  // Filter array items
  if (filteredSchema.type === "array" && filteredSchema.items) {
    if (isJSONSchema(filteredSchema.items)) {
      // Single schema for all items
      filteredSchema.items = hideInternalConfiguration(filteredSchema.items);
    } else if (Array.isArray(filteredSchema.items)) {
      // Array of schemas for tuple validation
      filteredSchema.items = filteredSchema.items.map((item) =>
        isJSONSchema(item) ? hideInternalConfiguration(item) : item
      );
    }
  }

  // Note: we don't handle anyOf, allOf, oneOf yet as we cannot disambiguate whether to inject the configuration
  // since we entirely hide the configuration from the agent.

  return filteredSchema;
}

/**
 * Injects a value into the inputs based on the MIME type of a property schema.
 */
function injectValueForMimeType({
  owner,
  inputs,
  path,
  schema,
  actionConfiguration,
}: {
  owner: WorkspaceType;
  inputs: Record<string, unknown>;
  path: string[];
  schema: JSONSchema;
  actionConfiguration: MCPToolConfigurationType;
}) {
  // Check if this property has a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION
  for (const mimeType of Object.values(INTERNAL_MIME_TYPES.CONFIGURATION)) {
    if (containsSubSchema(schema, ConfigurableToolInputJSONSchemas[mimeType])) {
      // We found a matching mimeType, augment the inputs
      setValueAtPath(
        inputs,
        path,
        generateConfiguredInput({ owner, actionConfiguration, mimeType })
      );
    }
  }
}

/**
 * Augments the inputs with configuration data from actionConfiguration.
 * For each missing property that has a mimeType matching a value in INTERNAL_MIME_TYPES.CONFIGURATION,
 * it adds the corresponding data from actionConfiguration.
 * This function uses Ajv validation errors to identify missing properties.
 */
export function augmentInputsWithConfiguration({
  owner,
  rawInputs,
  actionConfiguration,
}: {
  owner: WorkspaceType;
  rawInputs: Record<string, unknown>;
  actionConfiguration: ActionConfigurationType;
}): Record<string, unknown> {
  // For non-MCP actions, we don't do inputs augmentation
  if (!isMCPActionConfiguration(actionConfiguration)) {
    return rawInputs;
  }

  const { inputSchema } = actionConfiguration;
  if (!inputSchema.properties) {
    return rawInputs;
  }

  const inputs = rawInputs;

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(inputSchema);
  const isValid = validate(inputs);

  if (!isValid && validate.errors) {
    for (const error of validate.errors) {
      if (error.keyword !== "required" || !error.params.missingProperty) {
        continue;
      }

      const missingProp = error.params.missingProperty;

      const parentPath = error.instancePath
        ? error.instancePath.split("/").filter(Boolean)
        : [];

      const fullPath = [...parentPath, missingProp];
      const propSchema = findSchemaAtPath(inputSchema, fullPath);

      // If we found a schema and it has a matching MIME type, inject the value
      if (propSchema) {
        injectValueForMimeType({
          owner,
          inputs,
          path: fullPath,
          schema: propSchema,
          actionConfiguration,
        });
      }
    }
  }

  return inputs;
}
