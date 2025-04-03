import type { InternalConfigurationMimeType } from "@dust-tt/client";
import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Ajv } from "ajv";
import type {
  JSONSchema7 as JSONSchema,
  JSONSchema7Definition as JSONSchemaDefinition,
} from "json-schema";
import { z } from "zod";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { MCPServerType } from "@app/lib/actions/mcp_metadata";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import { isMCPActionConfiguration } from "@app/lib/actions/types/guards";
import { makeSId } from "@app/lib/resources/string_ids";
import type { WorkspaceType } from "@app/types";

/**
 * Recursively checks if any property or nested property of an object has a mimeType matching the target value.
 */
function hasPropertyMatchingMimeType(
  obj: Record<string, any>,
  mimeType: InternalConfigurationMimeType
): boolean {
  // Null check first to prevent errors
  if (obj === null || obj === undefined) {
    return false;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === "mimeType" && value.const === mimeType) {
      return true;
    }

    // Recursively check nested objects, but avoid null values
    if (value !== null && typeof value === "object") {
      if (hasPropertyMatchingMimeType(value, mimeType)) {
        return true;
      }
    }
  }

  return false;
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
  if (!serverMetadata?.tools) {
    return false;
  }

  return serverMetadata.tools.some((tool) => {
    if (!tool?.inputSchema) {
      return false;
    }

    return hasPropertyMatchingMimeType(tool.inputSchema, mimeType);
  });
}

/**
 * Recursively filters out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION.
 * This function handles nested objects and arrays.
 */
export function filterInternalConfiguration(
  inputSchema: JSONSchema
): JSONSchema {
  // Base case: if not an object or null, return as is
  if (!isJSONSchema(inputSchema)) {
    return inputSchema;
  }

  // Create a deep copy to avoid modifying the original
  const filteredSchema = { ...inputSchema };

  // Filter properties
  if (filteredSchema.properties) {
    const filteredProperties: JSONSchema["properties"] = {};
    const removedRequiredProps: string[] = [];

    for (const [key, value] of Object.entries(filteredSchema.properties)) {
      // Skip properties that have a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION
      let shouldInclude = true;

      if (isJSONSchema(value)) {
        // Check if this property has a matching mimeType
        for (const mimeType of Object.values(
          INTERNAL_MIME_TYPES.CONFIGURATION
        )) {
          if (hasPropertyMatchingMimeType(value, mimeType)) {
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
          filteredProperties[key] = filterInternalConfiguration(value);
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
      filteredSchema.items = filterInternalConfiguration(filteredSchema.items);
    } else if (Array.isArray(filteredSchema.items)) {
      // Array of schemas for tuple validation
      filteredSchema.items = filteredSchema.items.map((item) =>
        isJSONSchema(item) ? filterInternalConfiguration(item) : item
      );
    }

    // Handle additionalItems
    if (
      filteredSchema.additionalItems &&
      isJSONSchema(filteredSchema.additionalItems)
    ) {
      filteredSchema.additionalItems = filterInternalConfiguration(
        filteredSchema.additionalItems
      );
    }
  }

  // Filter allOf, anyOf, oneOf
  for (const key of ["allOf", "anyOf", "oneOf"] as const) {
    if (Array.isArray(filteredSchema[key])) {
      filteredSchema[key] = filteredSchema[key]!.map((schema) =>
        isJSONSchema(schema) ? filterInternalConfiguration(schema) : schema
      );
    }
  }

  // Filter not
  if (filteredSchema.not && isJSONSchema(filteredSchema.not)) {
    filteredSchema.not = filterInternalConfiguration(filteredSchema.not);
  }

  return filteredSchema;
}

/**
 * Sets a value at a specific path in a nested object structure.
 * Assumes that intermediate objects already exist.
 */
function setValueAtPath<T>(
  obj: Record<string, unknown>,
  path: string[],
  value: T
): void {
  if (path.length === 0) {
    return;
  }

  let current: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    current = current[key] as Record<string, unknown>;
  }

  current[path[path.length - 1]] = value;
}

/**
 * Type guard to check if a value is a JSONSchema object
 */
function isJSONSchema(
  value: JSONSchema | JSONSchemaDefinition | JSONSchemaDefinition[] | boolean
): value is JSONSchema {
  return value !== null && typeof value === "object";
}

/**
 * Finds the schema for a property at a specific path in a JSON schema.
 * Handles both object properties and array items.
 */
function findSchemaAtPath(
  schema: JSONSchema,
  path: string[]
): JSONSchema | null {
  if (!path.length) {
    return schema;
  }

  let currentSchema: JSONSchema | null = schema;

  for (const segment of path) {
    if (!currentSchema) {
      return null;
    }

    // Navigate through object properties
    if (currentSchema.properties && segment in currentSchema.properties) {
      const propSchema: JSONSchemaDefinition =
        currentSchema.properties[segment];
      if (isJSONSchema(propSchema)) {
        currentSchema = propSchema;
      } else {
        return null; // Not a valid schema
      }
    } else {
      return null; // Path doesn't exist in the schema
    }
  }

  return currentSchema;
}

/**
 * Injects a value into the inputs based on the MIME type of a property schema.
 * Returns true if a value was injected, false otherwise.
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
    if (hasPropertyMatchingMimeType(schema, mimeType)) {
      // We found a matching mimeType, augment the inputs
      switch (mimeType) {
        case INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE: {
          setValueAtPath(
            inputs,
            path,
            actionConfiguration.dataSourceConfigurations?.map((config) => ({
              // TODO: create a Resource for AgentDataSourceConfiguration and move the makeSId to a method in it.
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
          break;
        }
        default:
          assertNever(mimeType);
      }
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

  // Use Ajv to validate and get errors
  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(inputSchema);
  const isValid = validate(inputs);

  if (!isValid && validate.errors) {
    for (const error of validate.errors) {
      // Only process required property errors
      if (error.keyword !== "required" || !error.params.missingProperty) {
        continue;
      }

      const missingProp = error.params.missingProperty;

      // The instancePath gives us the path to the parent object that's missing the property
      const parentPath = error.instancePath
        ? error.instancePath.split("/").filter(Boolean)
        : [];

      // Combine the parent path with missing property to get the full path
      const fullPath = [...parentPath, missingProp];

      // Find the schema for this property
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

export const DataSourceConfigurationInputSchema = z.array(
  z.object({
    uri: z
      .string()
      .regex(
        /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/
      ),
    mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
  })
);
