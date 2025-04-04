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
import {
  containsSubSchema,
  findSchemaAtPath,
  isJSONSchemaObject,
  schemasAreEqual,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WorkspaceType } from "@app/types";

export const DATA_SOURCE_CONFIGURATION_URI_PATTERN =
  /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/;

/**
 * Mapping between the mime types we used to identify a configurable resource and the Zod schema used to validate it.
 */
export const ConfigurableToolInputSchemas = {
  [INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE]: z.array(
    z.object({
      uri: z.string().regex(DATA_SOURCE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
    })
  ),
  // We use a satisfies here to ensure that all the InternalConfigurationMimeType are covered whilst preserving the type
  // inference in tools definitions (server.tool is templated).
} as const satisfies Record<InternalConfigurationMimeType, z.ZodSchema>;

export type ConfigurableToolInputType = z.infer<
  (typeof ConfigurableToolInputSchemas)[InternalConfigurationMimeType]
>;

/**
 * Mapping between the mime types we used to identify a configurable resource
 * and the JSON schema resulting from the Zod schema defined above.
 */
const ConfigurableToolInputJSONSchemas = Object.fromEntries(
  Object.entries(ConfigurableToolInputSchemas).map(([key, schema]) => [
    key,
    zodToJsonSchema(schema),
  ])
) as Record<InternalConfigurationMimeType, JSONSchema>;

/**
 * Defines how we fill the actual inputs of the tool for each mime type.
 * TODO(mcp): typing too weak here, testing the inference is hard before we have more INTERNAL_MIME_TYPES.CONFIGURATION.
 */
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
        actionConfiguration.dataSources?.map((config) => ({
          uri: `data_source_configuration://dust/w/${owner.sId}/data_source_configurations/${config.sId}`,
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
  const resultingSchema = { ...inputSchema };

  // Filter properties
  if (inputSchema.properties) {
    const filteredProperties: JSONSchema["properties"] = {};
    const removedRequiredProps: string[] = [];

    for (const [key, property] of Object.entries(inputSchema.properties)) {
      let shouldInclude = true;

      if (isJSONSchemaObject(property)) {
        // Check if this property has a matching mimeType.
        for (const schema of Object.values(ConfigurableToolInputJSONSchemas)) {
          if (schemasAreEqual(property, schema)) {
            shouldInclude = false;
            // Track removed properties that were in the required array.
            if (resultingSchema.required?.includes(key)) {
              removedRequiredProps.push(key);
            }
            break;
          }
        }

        if (shouldInclude) {
          // Recursively filter nested properties
          filteredProperties[key] = hideInternalConfiguration(property);
        }
      } else {
        // Keep non-object values as is
        filteredProperties[key] = property;
      }
    }

    resultingSchema.properties = filteredProperties;

    // Update required properties if any were removed
    if (removedRequiredProps.length > 0 && resultingSchema.required) {
      resultingSchema.required = resultingSchema.required.filter(
        (prop) => !removedRequiredProps.includes(prop)
      );
    }
  }

  // Filter array items
  if (resultingSchema.type === "array" && resultingSchema.items) {
    if (isJSONSchemaObject(resultingSchema.items)) {
      // Single schema for all items
      resultingSchema.items = hideInternalConfiguration(resultingSchema.items);
    } else if (Array.isArray(resultingSchema.items)) {
      // Array of schemas for tuple validation
      resultingSchema.items = resultingSchema.items.map((item) =>
        isJSONSchemaObject(item) ? hideInternalConfiguration(item) : item
      );
    }
  }

  // Note: we don't handle anyOf, allOf, oneOf yet as we cannot disambiguate whether to inject the configuration
  // since we entirely hide the configuration from the agent.

  return resultingSchema;
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
        for (const mimeType of Object.values(
          INTERNAL_MIME_TYPES.CONFIGURATION
        )) {
          if (
            schemasAreEqual(
              propSchema,
              ConfigurableToolInputJSONSchemas[mimeType]
            )
          ) {
            // We found a matching mimeType, augment the inputs
            setValueAtPath(
              inputs,
              fullPath,
              generateConfiguredInput({ owner, actionConfiguration, mimeType })
            );
          }
        }
      }
    }
  }

  return inputs;
}
