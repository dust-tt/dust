import type { InternalConfigurationMimeType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

import type { MCPServerMetadata } from "@app/lib/actions/mcp_actions";
import type { InputSchemaType } from "@app/lib/actions/types/agent";

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
  serverMetadata: MCPServerMetadata;
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
 * Filters out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION.
 */
export function filterInternalConfigurationProperties(
  inputSchema: InputSchemaType
): InputSchemaType {
  if (!inputSchema.properties) {
    return inputSchema;
  }

  const filteredProperties: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(inputSchema.properties)) {
    // Skip properties that have a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION
    let shouldInclude = true;

    // Check if this property has a mimeType property
    if (value && typeof value === "object") {
      for (const mimeType of Object.values(INTERNAL_MIME_TYPES.CONFIGURATION)) {
        if (hasPropertyMatchingMimeType(value, mimeType as InternalConfigurationMimeType)) {
          shouldInclude = false;
          break;
        }
      }
    }

    if (shouldInclude) {
      filteredProperties[key] = value;
    }
  }

  return {
    ...inputSchema,
    properties: filteredProperties,
  };
}

export const DataSourceConfigurationInputSchema = z.object({
  uri: z
    .string()
    .regex(
      /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/
    ),
  mimeType: z.literal(INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE),
});
