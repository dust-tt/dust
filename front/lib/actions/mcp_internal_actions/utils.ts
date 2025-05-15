import type { InternalToolInputMimeType } from "@dust-tt/client";
import { assertNever, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Ajv } from "ajv";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolResult } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";
import {
  findMatchingSubSchemas,
  findSchemaAtPath,
  followInternalRef,
  isJSONSchemaObject,
  isSchemaConfigurable,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WorkspaceType } from "@app/types";

export function makeMCPToolTextError(text: string): MCPToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result: string;
}): CallToolResult => {
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
  result: any;
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
  mayRequiresTimeFrameConfiguration: boolean;
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
      mayRequiresTimeFrameConfiguration: false,
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
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.CHILD_AGENT,
      })
    ).length > 0;

  const requiresReasoningConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServer: server,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
      })
    ).length > 0;

  const mayRequiresTimeFrameConfiguration = server.tools.some(
    (tool) => tool.inputSchema?.properties?.timeFrame
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
    mayRequiresTimeFrameConfiguration,
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
      !mayRequiresTimeFrameConfiguration &&
      requiredStrings.length === 0 &&
      requiredNumbers.length === 0 &&
      requiredBooleans.length === 0 &&
      Object.keys(requiredEnums).length === 0,
  };
}
