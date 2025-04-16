import type { InternalToolInputMimeType } from "@dust-tt/client";
import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { Ajv } from "ajv";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";
import {
  isMCPActionConfiguration,
  isPlatformMCPToolConfiguration,
} from "@app/lib/actions/types/guards";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import {
  findMatchingSchemaKeys,
  findSchemaAtPath,
  followInternalRef,
  isJSONSchemaObject,
  schemasAreEqual,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WorkspaceType } from "@app/types";

// TODO(mcp): use the definitions from the client instead of copying them here.
// Currently the type inference does not work as is.

export const DATA_SOURCE_CONFIGURATION_URI_PATTERN =
  /^data_source_configuration:\/\/dust\/w\/(\w+)\/data_source_configurations\/(\w+)$/;

export const TABLE_CONFIGURATION_URI_PATTERN =
  /^table_configuration:\/\/dust\/w\/(\w+)\/table_configurations\/(\w+)$/;

// URI pattern for configuring the agent to use within an action (agent calls agent, sort of Russian doll situation).
export const CHILD_AGENT_CONFIGURATION_URI_PATTERN =
  /^agent:\/\/dust\/w\/(\w+)\/agents\/(\w+)$/;

/**
 * Mapping between the mime types we used to identify a configurable resource and the Zod schema used to validate it.
 */
export const ConfigurableToolInputSchemas = {
  [INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE]: z.array(
    z.object({
      uri: z.string().regex(DATA_SOURCE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE),
    })
  ),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE]: z.array(
    z.object({
      uri: z.string().regex(TABLE_CONFIGURATION_URI_PATTERN),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE),
    })
  ),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.CHILD_AGENT]: z.object({
    uri: z.string().regex(CHILD_AGENT_CONFIGURATION_URI_PATTERN),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.CHILD_AGENT),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.STRING]: z.object({
    value: z.string(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.STRING),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER]: z.object({
    value: z.number(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER),
  }),
  [INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN]: z.object({
    value: z.boolean(),
    mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN),
  }),
} as const satisfies Record<InternalToolInputMimeType, z.ZodType>;

export type ConfigurableToolInputType = z.infer<
  (typeof ConfigurableToolInputSchemas)[InternalToolInputMimeType]
>;

/**
 * Mapping between the mime types we used to identify a configurable resource
 * and the JSON schema resulting from the Zod schema defined above.
 */
export const ConfigurableToolInputJSONSchemas = Object.fromEntries(
  Object.entries(ConfigurableToolInputSchemas).map(([key, schema]) => [
    key,
    zodToJsonSchema(schema),
  ])
) as Record<InternalToolInputMimeType, JSONSchema>;

/**
 * Defines how we fill the actual inputs of the tool for each mime type.
 */
export function generateConfiguredInput({
  actionConfiguration,
  owner,
  mimeType,
  keyPath,
}: {
  owner: WorkspaceType;
  actionConfiguration: MCPToolConfigurationType;
  mimeType: InternalToolInputMimeType;
  keyPath: string;
}): ConfigurableToolInputType {
  assert(
    isPlatformMCPToolConfiguration(actionConfiguration),
    "Action configuration must be a platform MCP tool configuration"
  );

  switch (mimeType) {
    case INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE:
      return (
        actionConfiguration.dataSources?.map((config) => ({
          uri: `data_source_configuration://dust/w/${owner.sId}/data_source_configurations/${config.sId}`,
          mimeType,
        })) || []
      );

    case INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE:
      return (
        actionConfiguration.tables?.map((config) => ({
          uri: `table_configuration://dust/w/${owner.sId}/table_configurations/${config.sId}`,
          mimeType,
        })) || []
      );

    case INTERNAL_MIME_TYPES.TOOL_INPUT.CHILD_AGENT: {
      const { childAgentId } = actionConfiguration;
      if (!childAgentId) {
        // Unreachable, when fetching agent configurations using getAgentConfigurations, we always fill the sId.
        throw new Error(
          "Unreachable: child agent configuration without an sId."
        );
      }
      return {
        uri: `agent://dust/w/${owner.sId}/agents/${childAgentId}`,
        mimeType,
      };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.STRING: {
      // For primitive types, we have rendered the key from the path and use it to look up the value.
      const value = actionConfiguration.additionalConfiguration[keyPath];
      if (typeof value !== "string") {
        throw new Error(
          `Expected string value for key ${keyPath}, got ${typeof value}`
        );
      }
      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER: {
      const value = actionConfiguration.additionalConfiguration[keyPath];
      if (typeof value !== "number") {
        throw new Error(
          `Expected number value for key ${keyPath}, got ${typeof value}`
        );
      }
      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN: {
      const value = actionConfiguration.additionalConfiguration[keyPath];
      if (typeof value !== "boolean") {
        throw new Error(
          `Expected boolean value for key ${keyPath}, got ${typeof value}`
        );
      }
      return { value, mimeType };
    }

    default:
      assertNever(mimeType);
  }
}

/**
 * Returns all paths in a server's tools' inputSchemas that match the schema for the specified mimeType.
 * @returns An array of paths where the schema matches the specified mimeType
 */
export function findPathsToConfiguration({
  mcpServer,
  mimeType,
}: {
  mcpServer: MCPServerType;
  mimeType: InternalToolInputMimeType;
}): string[] {
  return mcpServer.tools.flatMap((tool) =>
    tool.inputSchema
      ? findMatchingSchemaKeys(
          tool.inputSchema,
          ConfigurableToolInputJSONSchemas[mimeType]
        )
      : []
  );
}

/**
 * Recursively filters out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.TOOL_INPUT.
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
        for (const schema of Object.values(ConfigurableToolInputJSONSchemas)) {
          // Check if the property matches the schema, following references if $ref points to a schema internally.
          let schemasMatch = schemasAreEqual(property, schema);

          if (!schemasMatch && property.$ref) {
            const refSchema = followInternalRef(inputSchema, property.$ref);
            if (refSchema) {
              schemasMatch = schemasAreEqual(refSchema, schema);
            }
          }

          if (schemasMatch) {
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
 * For each missing property that has a mimeType matching a value in INTERNAL_MIME_TYPES.TOOL_INPUT,
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

  // Note: When using AJV validation, string patterns must use regex syntax (e.g. /^fil_/) instead
  // of startsWith() to avoid "Invalid escape" errors. This is important because our Zod schemas are
  // converted to JSON Schema for AJV validation, and AJV requires regex patterns for string
  // validation.
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
      let propSchema = findSchemaAtPath(inputSchema, fullPath);
      // If the schema we found is a reference, follow it.
      if (propSchema?.$ref) {
        propSchema = followInternalRef(inputSchema, propSchema.$ref);
      }

      // If we found a schema and it has a matching MIME type, inject the value
      if (propSchema) {
        for (const mimeType of Object.values(INTERNAL_MIME_TYPES.TOOL_INPUT)) {
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
              generateConfiguredInput({
                owner,
                actionConfiguration,
                mimeType,
                keyPath: fullPath.join("."),
              })
            );
          }
        }
      }
    }
  }

  return inputs;
}

export function getMCPServerRequirements(
  mcpServerView: MCPServerViewType | null | undefined
): {
  requiresDataSourceConfiguration: boolean;
  requiresTableConfiguration: boolean;
  requiresChildAgentConfiguration: boolean;
  requiredStrings: Record<string, string>;
  requiredNumbers: Record<string, number | null>;
  requiredBooleans: Record<string, boolean>;
  noRequirement: boolean;
} {
  if (!mcpServerView) {
    return {
      requiresDataSourceConfiguration: false,
      requiresTableConfiguration: false,
      requiresChildAgentConfiguration: false,
      requiredStrings: {},
      requiredNumbers: {},
      requiredBooleans: {},
      noRequirement: false,
    };
  }
  const { server } = mcpServerView;
  const requiresDataSourceConfiguration =
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    }).length > 0;
  const requiresTableConfiguration =
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
    }).length > 0;
  const requiresChildAgentConfiguration =
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.CHILD_AGENT,
    }).length > 0;
  const requiredStrings = Object.fromEntries(
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
    }).map((path) => [path, ""])
  );
  const requiredNumbers = Object.fromEntries(
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
    }).map((path) => [path, null])
  );
  const requiredBooleans = Object.fromEntries(
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
    }).map((path) => [path, false])
  );

  return {
    requiresDataSourceConfiguration,
    requiresTableConfiguration,
    requiresChildAgentConfiguration,
    requiredStrings,
    requiredNumbers,
    requiredBooleans,

    noRequirement:
      !requiresDataSourceConfiguration &&
      !requiresTableConfiguration &&
      !requiresChildAgentConfiguration &&
      Object.keys(requiredStrings).length === 0 &&
      Object.keys(requiredNumbers).length === 0 &&
      Object.keys(requiredBooleans).length === 0,
  };
}
