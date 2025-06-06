import type { InternalToolInputMimeType } from "@dust-tt/client";
import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { ZodError } from "zod";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  ConfigurableToolInputJSONSchemas,
  JsonSchemaSchema,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolResult } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import {
  areSchemasEqual,
  findSchemaAtPath,
  followInternalRef,
  isJSONSchemaObject,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WorkspaceType } from "@app/types";

/**
 * Error tool result. This won't fail in the agent loop but will be logged.
 * The text will be shown to the model.
 *
 * Do not use if the intent is to show an issue to the agent as part of a normal tool execution,
 * only use if the error should be logged and tracked.
 */
export function makeMCPToolTextError(text: string): MCPToolResult {
  return {
    isError: true,
    content: [{ type: "text", text }],
  };
}

/**
 * Success tool result.
 *
 * Use this if the intent is to show an issue to the agent that does not need logging
 * and is part of a normal tool execution.
 */
export function makeMCPToolRecoverableErrorSuccess(
  errorText: string
): MCPToolResult {
  return {
    isError: false,
    content: [{ type: "text", text: errorText }],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): CallToolResult => {
  if (!result) {
    return {
      isError: false,
      content: [{ type: "text", text: message }],
    };
  }
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  };
};

export const makeMCPToolJSONSuccess = ({
  message,
  result,
}: {
  message: string;
  result: object | string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: JSON.stringify(result, null, 2) },
    ],
  };
};

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
  // It's okay to return null if the schema of the mime type is nullable.
  assert(
    isServerSideMCPToolConfiguration(actionConfiguration),
    "Action configuration must be a server-side MCP tool configuration"
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

    case INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT: {
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

    case INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL: {
      const { reasoningModel } = actionConfiguration;
      if (!reasoningModel) {
        // Unreachable, when fetching agent configurations using getAgentConfigurations, we always fill the reasoning model.
        throw new Error("Unreachable: missing reasoning model configuration.");
      }
      const { modelId, providerId, temperature, reasoningEffort } =
        reasoningModel;
      return { modelId, providerId, temperature, reasoningEffort, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.NULLABLE_TIME_FRAME: {
      const { timeFrame } = actionConfiguration;
      if (!timeFrame) {
        return null;
      }

      const { duration, unit } = timeFrame;
      return { duration, unit, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA: {
      const { jsonSchema } = actionConfiguration;
      if (!jsonSchema) {
        return null;
      }
      try {
        const validatedSchema = JsonSchemaSchema.parse(jsonSchema);
        return {
          ...validatedSchema,
          mimeType,
        };
      } catch (error) {
        if (error instanceof ZodError) {
          throw new Error(
            `Invalid jsonSchema configuration for mimeType JSON_SCHEMA: ${error.errors
              .map((e) => `${e.path.join(".")}: ${e.message}`)
              .join(", ")}`
          );
        }
        throw error;
      }
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

    case INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM: {
      const value = actionConfiguration.additionalConfiguration[keyPath];
      if (typeof value !== "string") {
        throw new Error(
          `Expected string value for key ${keyPath}, got ${typeof value}`
        );
      }
      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP: {
      const appId = actionConfiguration.dustAppConfiguration
        ? actionConfiguration.dustAppConfiguration.appId
        : null;

      if (!appId) {
        throw new Error("Invalid Dust App configuration");
      }

      return {
        appId,
        mimeType,
      };
    }

    default:
      assertNever(mimeType);
  }
}

/**
 * Returns all paths in a server's tools' inputSchemas that match the schema for the specified mimeType.
 * @returns A record of paths where the schema matches the specified mimeType
 */
export function findPathsToConfiguration({
  mcpServer,
  mimeType,
}: {
  mcpServer: MCPServerType;
  mimeType: InternalToolInputMimeType;
}): Record<string, JSONSchema> {
  let matches: Record<string, JSONSchema> = {};
  for (const tool of mcpServer.tools) {
    if (tool.inputSchema) {
      matches = {
        ...matches,
        ...findMatchingSubSchemas(tool.inputSchema, mimeType),
      };
    }
  }
  return matches;
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
        for (const mimeType of Object.values(INTERNAL_MIME_TYPES.TOOL_INPUT)) {
          // Check if the property matches the schema, following references if $ref points to a schema internally.
          let schemasMatch = isSchemaConfigurable(property, mimeType);

          if (!schemasMatch && property.$ref) {
            const refSchema = followInternalRef(inputSchema, property.$ref);
            if (refSchema) {
              schemasMatch = isSchemaConfigurable(refSchema, mimeType);
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
  actionConfiguration: MCPToolConfigurationType;
}): Record<string, unknown> {
  const { inputSchema } = actionConfiguration;
  if (!inputSchema.properties) {
    return rawInputs;
  }

  const inputs = { ...rawInputs };

  const ajv = new Ajv({ allErrors: true, strict: false });

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
          if (isSchemaConfigurable(propSchema, mimeType)) {
            const value = generateConfiguredInput({
              owner,
              actionConfiguration,
              mimeType,
              keyPath: fullPath.join("."),
            });

            // We found a matching mimeType, augment the inputs
            setValueAtPath(inputs, fullPath, value);
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
  requiresReasoningConfiguration: boolean;
  mayRequireTimeFrameConfiguration: boolean;
  mayRequireJsonSchemaConfiguration: boolean;
  requiredStrings: string[];
  requiredNumbers: string[];
  requiredBooleans: string[];
  requiredEnums: Record<string, string[]>;
  requiredDustAppConfiguration: boolean;
  noRequirement: boolean;
} {
  if (!mcpServerView) {
    return {
      requiresDataSourceConfiguration: false,
      requiresTableConfiguration: false,
      requiresChildAgentConfiguration: false,
      requiresReasoningConfiguration: false,
      mayRequireTimeFrameConfiguration: false,
      mayRequireJsonSchemaConfiguration: false,
      requiredStrings: [],
      requiredNumbers: [],
      requiredBooleans: [],
      requiredEnums: {},
      requiredDustAppConfiguration: false,
      noRequirement: false,
    };
  }
  const { server } = mcpServerView;

  const requiresDataSourceConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      })
    ).length > 0;

  const requiresTableConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
      })
    ).length > 0;

  const requiresChildAgentConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
      })
    ).length > 0;

  const requiresReasoningConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
      })
    ).length > 0;

  const mayRequireTimeFrameConfiguration = server.tools.some(
    (tool) => tool.inputSchema?.properties?.timeFrame
  );

  const mayRequireJsonSchemaConfiguration = server.tools.some(
    (tool) => tool.inputSchema?.properties?.jsonSchema
  );

  const requiredStrings = Object.keys(
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
    })
  );

  const requiredNumbers = Object.keys(
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
    })
  );

  const requiredBooleans = Object.keys(
    findPathsToConfiguration({
      mcpServer: server,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
    })
  );

  const requiredEnums = Object.fromEntries(
    Object.entries(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
      })
    ).map(([key, schema]) => {
      const valueProperty = schema.properties?.value;
      if (!valueProperty || !isJSONSchemaObject(valueProperty)) {
        return [key, []];
      }
      return [
        key,
        valueProperty.enum?.filter((v): v is string => typeof v === "string") ??
          [],
      ];
    })
  );

  const requiredDustAppConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
      })
    ).length > 0;

  return {
    requiresDataSourceConfiguration,
    requiresTableConfiguration,
    requiresChildAgentConfiguration,
    requiresReasoningConfiguration,
    mayRequireTimeFrameConfiguration,
    mayRequireJsonSchemaConfiguration,
    requiredStrings,
    requiredNumbers,
    requiredBooleans,
    requiredEnums,
    requiredDustAppConfiguration,
    noRequirement:
      !requiresDataSourceConfiguration &&
      !requiresTableConfiguration &&
      !requiresChildAgentConfiguration &&
      !requiresReasoningConfiguration &&
      !requiredDustAppConfiguration &&
      !mayRequireTimeFrameConfiguration &&
      requiredStrings.length === 0 &&
      requiredNumbers.length === 0 &&
      requiredBooleans.length === 0 &&
      Object.keys(requiredEnums).length === 0,
  };
}

/**
 * Checks if a JSON schema matches should be idenfied as being configurable for a specific mime type.
 */
function isSchemaConfigurable(
  schema: JSONSchema,
  mimeType: InternalToolInputMimeType
): boolean {
  // If the mime type has a static configuration schema, we check that the schema matches it.
  if (mimeType !== INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM) {
    return areSchemasEqual(schema, ConfigurableToolInputJSONSchemas[mimeType]);
  }
  // If the mime type does not have a static configuration schema, it supports flexible schemas.
  // We only check that the schema has a `value` property and a `mimeType` property with the correct value.
  const mimeTypeProperty = schema.properties?.mimeType;
  if (
    schema.properties?.value &&
    mimeTypeProperty &&
    isJSONSchemaObject(mimeTypeProperty)
  ) {
    return (
      mimeTypeProperty.type === "string" && mimeTypeProperty.const === mimeType
    );
  }
  return false;
}

/**
 * Recursively finds all property keys and subschemas match a specific sub-schema.
 * This function handles nested objects and arrays.
 * @returns A record of property keys that match the schema comparison. Empty record if no matches found.
 */
export function findMatchingSubSchemas(
  inputSchema: JSONSchema,
  mimeType: InternalToolInputMimeType
): Record<string, JSONSchema> {
  const matches: Record<string, JSONSchema> = {};

  if (!isJSONSchemaObject(inputSchema)) {
    return matches;
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const [key, propSchema] of Object.entries(inputSchema.properties)) {
      if (isJSONSchemaObject(propSchema)) {
        // Check if this property's schema matches the target
        if (isSchemaConfigurable(propSchema, mimeType)) {
          matches[key] = propSchema;
        }

        // Following references within the main schema.
        // zodToJsonSchema generates references if the same subSchema is repeated.
        if (propSchema.$ref) {
          const refSchema = followInternalRef(inputSchema, propSchema.$ref);
          if (refSchema && isSchemaConfigurable(refSchema, mimeType)) {
            matches[key] = refSchema;
          }
        }

        // Recursively check this property's schema
        const nestedMatches = findMatchingSubSchemas(propSchema, mimeType);
        // For nested matches, prefix with the current property key
        for (const match of Object.keys(nestedMatches)) {
          if (match !== "") {
            // Skip the empty string from direct matches
            matches[`${key}.${match}`] = nestedMatches[match];
          }
        }
      }
    }
  }

  // Check items in array schemas
  if (inputSchema.type === "array" && inputSchema.items) {
    if (isJSONSchemaObject(inputSchema.items)) {
      // Single schema for all items
      const itemMatches = findMatchingSubSchemas(inputSchema.items, mimeType);
      // For array items, we use the 'items' key as a prefix
      for (const match of Object.keys(itemMatches)) {
        if (match !== "") {
          matches[`items.${match}`] = itemMatches[match];
        } else {
          matches["items"] = itemMatches[match];
        }
      }
    } else if (Array.isArray(inputSchema.items)) {
      // Array of schemas for tuple validation
      for (let i = 0; i < inputSchema.items.length; i++) {
        const item = inputSchema.items[i];
        if (isJSONSchemaObject(item)) {
          const itemMatches = findMatchingSubSchemas(item, mimeType);
          // For tuple items, we use the index as part of the key
          for (const match of Object.keys(itemMatches)) {
            if (match !== "") {
              matches[`items[${i}].${match}`] = itemMatches[match];
            } else {
              matches[`items[${i}]`] = itemMatches[match];
            }
          }
        }
      }
    }
  }

  // Check all other properties and values in the schema
  for (const [key, value] of Object.entries(inputSchema)) {
    // Skip properties and items as they are handled separately above
    if (
      key === "properties" ||
      key === "required" ||
      key === "anyOf" ||
      key === "enum" ||
      key === "type" ||
      (key === "items" && inputSchema.type === "array")
    ) {
      continue;
    }

    if (isJSONSchemaObject(value) && isSchemaConfigurable(value, mimeType)) {
      matches[key] = value;
    } else if (isJSONSchemaObject(value)) {
      const nestedMatches = findMatchingSubSchemas(value, mimeType);
      for (const match of Object.keys(nestedMatches)) {
        if (match !== "") {
          matches[`${key}.${match}`] = nestedMatches[match];
        } else {
          matches[key] = nestedMatches[match];
        }
      }
    }
  }

  // Note: we don't handle anyOf, allOf, oneOf yet as we cannot disambiguate whether to inject the configuration
  // since we entirely hide the configuration from the agent.

  return matches;
}
