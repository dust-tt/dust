import type { InternalToolInputMimeType } from "@dust-tt/client";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ConfigurableToolInputType } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import {
  ConfigurableToolInputJSONSchemas,
  validateConfiguredJsonSchema,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import {
  areSchemasEqual,
  ensurePathExists,
  findSchemaAtPath,
  followInternalRef,
  getValueAtPath,
  isJSONSchemaObject,
  iterateOverSchemaPropertiesRecursive,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type { WhitelistableFeature, WorkspaceType } from "@app/types";
import { assertNever, isString } from "@app/types";

function getDataSourceURI(config: DataSourceConfiguration): string {
  const { workspaceId, sId, dataSourceViewId, filter } = config;
  if (sId) {
    return `data_source_configuration://dust/w/${workspaceId}/data_source_configurations/${sId}`;
  }
  const encodedFilter = encodeURIComponent(JSON.stringify(filter));
  return `data_source_configuration://dust/w/${workspaceId}/data_source_views/${dataSourceViewId}/filter/${encodedFilter}`;
}

function getTableURI(config: TableDataSourceConfiguration): string {
  const { workspaceId, sId, dataSourceViewId, tableId } = config;
  if (sId) {
    return `table_configuration://dust/w/${workspaceId}/table_configurations/${sId}`;
  }
  return `table_configuration://dust/w/${workspaceId}/data_source_views/${dataSourceViewId}/tables/${tableId}`;
}

/**
 * Defines how we fill the actual inputs of the tool for each mime type.
 */
function generateConfiguredInput({
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

  type PrimitiveType = string | number | boolean | string[];

  /*
   * Get a validated value from the action configuration.
   * If the value is not provided, we look for a default value in the input schema.
   * If the value is provided, we validate it against the expected type.
   * If the value is not provided and there is no default value, we throw an error.
   */
  // TODO(2025-10-10 aubin): remove this function.
  const getValidatedValue = <U extends PrimitiveType>(
    actionConfiguration: MCPToolConfigurationType,
    keyPath: string,
    value: PrimitiveType | undefined,
    expectedType: string,
    typeGuard: (val: unknown) => val is U
  ): U => {
    if (value === undefined) {
      const propSchema = findSchemaAtPath(
        actionConfiguration.inputSchema,
        keyPath.split(".")
      );
      if (propSchema) {
        // Handle both object-level default {value, mimeType}
        if (
          propSchema.default &&
          typeof propSchema.default === "object" &&
          "value" in propSchema.default
        ) {
          if (typeGuard(propSchema.default.value)) {
            value = propSchema.default.value;
          } else {
            // Invalid object-level default type - throw specific error
            throw new Error(
              `Expected ${expectedType} value for key ${keyPath}, got ${typeof propSchema.default.value}`
            );
          }
        }
      }
    }
    if (!typeGuard(value)) {
      throw new Error(
        `Expected ${expectedType} value for key ${keyPath}, got ${typeof value}`
      );
    }
    return value;
  };

  switch (mimeType) {
    case INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE: {
      return (
        actionConfiguration.dataSources?.map((config) => ({
          uri: getDataSourceURI(config),
          mimeType,
        })) ?? []
      );
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE: {
      return (
        actionConfiguration.dataSources?.map((config) => ({
          uri: getDataSourceURI(config),
          mimeType,
        })) ?? []
      );
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE: {
      return (
        actionConfiguration.tables?.map((config) => ({
          uri: getTableURI(config),
          mimeType,
        })) ?? []
      );
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT: {
      const { childAgentId } = actionConfiguration;
      // Unreachable, when fetching agent configurations using getAgentConfigurations, we always fill the sId.
      assert(
        childAgentId,
        "Unreachable: child agent configuration without an sId."
      );
      return {
        uri: `agent://dust/w/${owner.sId}/agents/${childAgentId}`,
        mimeType,
      };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL: {
      const { reasoningModel } = actionConfiguration;
      // Unreachable, when fetching agent configurations using getAgentConfigurations, we always fill the reasoning model.
      assert(
        reasoningModel,
        "Unreachable: missing reasoning model configuration."
      );
      const { modelId, providerId, temperature, reasoningEffort } =
        reasoningModel;
      return { modelId, providerId, temperature, reasoningEffort, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME: {
      const { timeFrame } = actionConfiguration;
      if (!timeFrame) {
        return undefined;
      }

      const { duration, unit } = timeFrame;
      return { duration, unit, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA: {
      const { jsonSchema } = actionConfiguration;
      if (!jsonSchema) {
        return undefined;
      }
      const validationResult = validateConfiguredJsonSchema(jsonSchema);
      if (validationResult.isErr()) {
        throw validationResult.error;
      }
      return {
        ...validationResult.value,
        mimeType,
      };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.STRING: {
      // For primitive types, we have rendered the key from the path and use it to look up the value.
      const value = getValidatedValue<string>(
        actionConfiguration,
        keyPath,
        actionConfiguration.additionalConfiguration[keyPath],
        "string",
        (val): val is string => typeof val === "string"
      );

      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER: {
      const value = getValidatedValue<number>(
        actionConfiguration,
        keyPath,
        actionConfiguration.additionalConfiguration[keyPath],
        "number",
        (val): val is number => typeof val === "number"
      );

      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN: {
      const value = getValidatedValue<boolean>(
        actionConfiguration,
        keyPath,
        actionConfiguration.additionalConfiguration[keyPath],
        "boolean",
        (val): val is boolean => typeof val === "boolean"
      );

      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM: {
      const value = getValidatedValue<string>(
        actionConfiguration,
        keyPath,
        actionConfiguration.additionalConfiguration[keyPath],
        "string",
        (val): val is string => typeof val === "string"
      );
      return { value, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.LIST: {
      let values = actionConfiguration.additionalConfiguration[keyPath];
      if (
        values === undefined ||
        (Array.isArray(values) && values.length === 0)
      ) {
        const propSchema = findSchemaAtPath(
          actionConfiguration.inputSchema,
          keyPath.split(".")
        );
        if (propSchema) {
          // Handle both object-level default {values, mimeType}
          if (
            propSchema.default &&
            typeof propSchema.default === "object" &&
            "values" in propSchema.default
          ) {
            if (
              Array.isArray(propSchema.default.values) &&
              propSchema.default.values.every(isString)
            ) {
              values = propSchema.default.values;
            } else {
              // Invalid object-level default type - throw specific error
              throw new Error(
                `Expected array of string values for key ${keyPath}, got ${
                  Array.isArray(propSchema.default.values)
                    ? "array with non-string elements"
                    : typeof propSchema.default.values
                }`
              );
            }
          }
        }
      }
      if (!Array.isArray(values) || values.some((v) => isString(v))) {
        throw new Error(
          `Expected array of string values for key ${keyPath}, got ${typeof values}`
        );
      }

      return { values: values, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP: {
      const appId = actionConfiguration.dustAppConfiguration
        ? actionConfiguration.dustAppConfiguration.appId
        : null;

      if (!appId) {
        throw new Error("Invalid Dust App configuration");
      }

      return { appId, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.SECRET: {
      const secretName = actionConfiguration.secretName;

      if (!secretName) {
        throw new Error("Invalid Secret configuration");
      }

      return { secretName, mimeType };
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
  mcpServerView,
  mimeType,
}: {
  mcpServerView: MCPServerViewType;
  mimeType: InternalToolInputMimeType;
}): Record<string, JSONSchema> {
  const disabledTools =
    mcpServerView.toolsMetadata
      ?.filter((tool) => !tool.enabled)
      .map((tool) => tool.toolName) ?? [];
  const mcpServer = mcpServerView.server;
  let matches: Record<string, JSONSchema> = {};
  for (const tool of mcpServer.tools) {
    // Skip disabled tools
    if (disabledTools.includes(tool.name)) {
      continue;
    }

    if (tool.inputSchema) {
      const inlinedSchema = inlineAllRefs(tool.inputSchema);
      matches = {
        ...matches,
        ...findMatchingSubSchemas(inlinedSchema, mimeType),
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

  // Note: we don't handle allOf, oneOf yet as we cannot disambiguate whether to inject the configuration
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
  iterateOverSchemaPropertiesRecursive(inputSchema, (fullPath, propSchema) => {
    for (const mimeType of Object.values(INTERNAL_MIME_TYPES.TOOL_INPUT)) {
      if (isSchemaConfigurable(propSchema, mimeType)) {
        const valueAtPath = getValueAtPath(inputs, fullPath);
        if (valueAtPath) {
          return false;
        }

        const value = generateConfiguredInput({
          owner,
          actionConfiguration,
          mimeType,
          keyPath: fullPath.join("."),
        });

        // Ensure intermediate path exists
        ensurePathExists(inputs, fullPath);
        // We found a matching mimeType, augment the inputs
        setValueAtPath(inputs, fullPath, value);
        return false;
      }
    }
    return true;
  });

  return inputs;
}

export interface MCPServerRequirements {
  requiresDataSourceConfiguration: boolean;
  requiresDataWarehouseConfiguration: boolean;
  requiresTableConfiguration: boolean;
  requiresChildAgentConfiguration: boolean;
  requiresReasoningConfiguration: boolean;
  mayRequireTimeFrameConfiguration: boolean;
  mayRequireJsonSchemaConfiguration: boolean;
  // TODO(2025-10-10 aubin): align type with enums and lists by using Records.
  requiredStrings: {
    key: string;
    description?: string;
    default?: string;
  }[];
  requiredNumbers: {
    key: string;
    description?: string;
    default?: number;
  }[];
  requiredBooleans: {
    key: string;
    description?: string;
    default?: boolean;
  }[];
  requiredEnums: Record<
    string,
    {
      options: { value: string; label: string; description?: string }[];
      description?: string;
      default?: string;
    }
  >;
  requiredLists: Record<
    string,
    {
      options: { value: string; label: string; description?: string }[];
      description?: string;
      values?: string[];
      default?: string;
    }
  >;
  requiresDustAppConfiguration: boolean;
  requiresSecretConfiguration: boolean;
  noRequirement: boolean;
}

export function getMCPServerRequirements(
  mcpServerView: MCPServerViewType | null | undefined,
  featureFlags?: WhitelistableFeature[]
): MCPServerRequirements {
  if (!mcpServerView) {
    return {
      requiresDataSourceConfiguration: false,
      requiresDataWarehouseConfiguration: false,
      requiresTableConfiguration: false,
      requiresChildAgentConfiguration: false,
      requiresReasoningConfiguration: false,
      mayRequireTimeFrameConfiguration: false,
      mayRequireJsonSchemaConfiguration: false,
      requiredStrings: [],
      requiredNumbers: [],
      requiredBooleans: [],
      requiredEnums: {},
      requiredLists: {},
      requiresDustAppConfiguration: false,
      requiresSecretConfiguration: false,
      noRequirement: false,
    };
  }
  const { server } = mcpServerView;

  function extractSchemaDefault<T>(
    schema: JSONSchema,
    typeGuard: (value: unknown) => value is T
  ): T | undefined {
    // Try object-level default first: { value: T, mimeType: "..." }
    if (
      schema.default &&
      typeof schema.default === "object" &&
      "value" in schema.default &&
      typeGuard(schema.default.value)
    ) {
      return schema.default.value;
    }

    return undefined;
  }

  const requiresDataSourceConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
      })
    ).length > 0;

  const requiresDataWarehouseConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE,
      })
    ).length > 0;

  const requiresTableConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
      })
    ).length > 0;

  const requiresChildAgentConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
      })
    ).length > 0;

  const requiresReasoningConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
      })
    ).length > 0;

  // If there is no toolsMetadata (= undefined or empty array), it means everything is enabled
  const disabledToolNames =
    mcpServerView.toolsMetadata
      ?.filter((tool) => tool.enabled === false)
      .map((tool) => tool.toolName) ?? [];

  const enabledTools =
    disabledToolNames.length > 0
      ? server.tools.filter((tool) => !disabledToolNames.includes(tool.name))
      : server.tools;

  const mayRequireTimeFrameConfiguration = enabledTools.some(
    (tool) => tool.inputSchema?.properties?.timeFrame
  );

  const mayRequireJsonSchemaConfiguration = enabledTools.some(
    (tool) => tool.inputSchema?.properties?.jsonSchema
  );

  const requiredStrings = Object.entries(
    findPathsToConfiguration({
      mcpServerView,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
    })
  ).map(([key, schema]) => ({
    key,
    description: schema.description,
    default: extractSchemaDefault(schema, isString),
  }));

  const requiredNumbers = Object.entries(
    findPathsToConfiguration({
      mcpServerView,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
    })
  ).map(([key, schema]) => ({
    key,
    description: schema.description,
    default: extractSchemaDefault(
      schema,
      (v: unknown): v is number => typeof v === "number"
    ),
  }));

  const requiredBooleans = Object.entries(
    findPathsToConfiguration({
      mcpServerView,
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
    })
  )
    .map(([key, schema]) => ({
      key,
      description: schema.description,
      default: extractSchemaDefault(
        schema,
        (v: unknown): v is boolean => typeof v === "boolean"
      ),
    }))
    // Exclude useSummary if the user doesn't have the web_summarization feature flag.
    .filter(
      ({ key }) =>
        key !== "useSummary" || featureFlags?.includes("web_summarization")
    );

  const requiredEnums: Record<
    string,
    {
      options: { value: string; label: string; description?: string }[];
      description?: string;
      default?: string;
    }
  > = Object.fromEntries(
    Object.entries(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
      })
    ).map(([key, schema]) => {
      const optionsProperty = schema.properties?.options;
      if (!optionsProperty || !isJSONSchemaObject(optionsProperty)) {
        return [key, { options: [], description: schema.description }];
      }

      const defaultValue = extractSchemaDefault(schema, isString);

      const options = Array.isArray(optionsProperty.anyOf)
        ? (optionsProperty.anyOf
            .map((v) => {
              if (
                isJSONSchemaObject(v) &&
                isJSONSchemaObject(v.properties?.value) &&
                isJSONSchemaObject(v.properties?.label) &&
                v.properties.value.const &&
                v.properties.label.const
              ) {
                return {
                  value: v.properties.value.const,
                  label: v.properties.label.const,
                  description:
                    typeof v.description === "string"
                      ? v.description
                      : undefined,
                };
              }
              return null;
            })
            .filter((v) => v !== null) as {
            value: string;
            label: string;
            description?: string;
          }[])
        : [];

      if (options.length === 0) {
        throw new Error(`No valid enum options found for key ${key}`);
      }

      return [
        key,
        {
          options,
          description: schema.description,
          default: defaultValue,
        },
      ];
    })
  );

  const requiredLists: Record<
    string,
    {
      options: { value: string; label: string; description?: string }[];
      description?: string;
      values?: string[];
      default?: string;
    }
  > = Object.fromEntries(
    Object.entries(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
      })
    ).map(([key, schema]) => {
      const optionsProperty = schema.properties?.options;

      if (!optionsProperty || !isJSONSchemaObject(optionsProperty)) {
        return [key, { options: [], description: schema.description }];
      }

      const options =
        (optionsProperty.anyOf
          ?.map((v) => {
            if (
              isJSONSchemaObject(v) &&
              isJSONSchemaObject(v.properties?.value) &&
              isJSONSchemaObject(v.properties?.label) &&
              v.properties.value.const &&
              v.properties.label.const
            ) {
              return {
                value: v.properties.value.const,
                label: v.properties.label.const,
                description:
                  typeof v.description === "string" ? v.description : undefined,
              };
            }
            return null;
          })
          .filter((v) => v !== null) as {
          value: string;
          label: string;
          description?: string;
        }[]) ?? [];

      if (options.length === 0) {
        throw new Error(`No valid list options found for key ${key}`);
      }

      const defaultValue = extractSchemaDefault(schema, isString);

      return [
        key,
        {
          options,
          description: schema.description,
          default: defaultValue,
        },
      ];
    })
  );

  const requiresDustAppConfiguration =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
      })
    ).length > 0;

  const requiresSecretConfiguration =
    mcpServerView.server.requiresSecret === true;

  return {
    requiresDataSourceConfiguration,
    requiresDataWarehouseConfiguration,
    requiresTableConfiguration,
    requiresChildAgentConfiguration,
    requiresReasoningConfiguration,
    mayRequireTimeFrameConfiguration,
    mayRequireJsonSchemaConfiguration,
    requiredStrings,
    requiredNumbers,
    requiredBooleans,
    requiredEnums,
    requiredLists,
    requiresDustAppConfiguration,
    requiresSecretConfiguration,
    noRequirement:
      !requiresDataSourceConfiguration &&
      !requiresDataWarehouseConfiguration &&
      !requiresTableConfiguration &&
      !requiresChildAgentConfiguration &&
      !requiresReasoningConfiguration &&
      !requiresDustAppConfiguration &&
      !mayRequireTimeFrameConfiguration &&
      !requiredStrings.some((c) => c.default === undefined) &&
      !requiredNumbers.some((c) => c.default === undefined) &&
      !requiredBooleans.some((c) => c.default === undefined) &&
      !Object.values(requiredEnums).some((c) => c.default === undefined) &&
      !Object.values(requiredLists).some((c) => c.default === undefined),
  };
}

/**
 * Checks if a JSON schema should be identified as being configurable for a specific mime type.
 */
function isSchemaConfigurable(
  schema: JSONSchema,
  mimeType: InternalToolInputMimeType
): boolean {
  if (mimeType === INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM) {
    // We check that the schema has an `options` property, a `value` property and a `mimeType` property with the correct value.
    const mimeTypeProperty = schema.properties?.mimeType;
    if (
      schema.properties?.options &&
      schema.properties?.value &&
      mimeTypeProperty &&
      isJSONSchemaObject(mimeTypeProperty)
    ) {
      return (
        mimeTypeProperty.type === "string" &&
        mimeTypeProperty.const === mimeType
      );
    }
    return false;
  }

  if (mimeType === INTERNAL_MIME_TYPES.TOOL_INPUT.LIST) {
    // We only check that the schema has a `options` property, a `values` property and a `mimeType` property with the correct value.
    const mimeTypeProperty = schema.properties?.mimeType;

    if (
      schema.properties?.options &&
      schema.properties?.values &&
      mimeTypeProperty &&
      isJSONSchemaObject(mimeTypeProperty)
    ) {
      return (
        mimeTypeProperty.type === "string" &&
        mimeTypeProperty.const === mimeType
      );
    }
    return false;
  }

  // If the mime type has a static configuration schema, we check that the schema matches it.
  return areSchemasEqual(schema, ConfigurableToolInputJSONSchemas[mimeType]);
}

/**
 * Recursively finds all property keys and subschemas match a specific sub-schema.
 * This function handles nested objects and arrays.
 * @returns A record of property keys that match the schema comparison.
 * Empty record if no matches are found.
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

function recursiveInlineAllRefs(
  schema: JSONSchema,
  rootSchema: JSONSchema
): JSONSchema {
  let outputSchema: JSONSchema = { ...schema };

  // If this schema is a direct reference, resolve it fully and continue inlining recursively
  if (schema.$ref) {
    const refSchema = followInternalRef(rootSchema, schema.$ref);
    if (refSchema && isJSONSchemaObject(refSchema)) {
      return recursiveInlineAllRefs(refSchema, rootSchema);
    }
    return schema;
  }

  if (schema.properties) {
    outputSchema.properties = {};
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      if (isJSONSchemaObject(propSchema)) {
        outputSchema.properties[key] = recursiveInlineAllRefs(
          propSchema,
          rootSchema
        );
      } else {
        outputSchema.properties[key] = propSchema;
      }
    }
  }

  if (schema.type == "array" && schema.items) {
    if (isJSONSchemaObject(schema.items)) {
      outputSchema.items = recursiveInlineAllRefs(schema.items, rootSchema);
    } else if (Array.isArray(schema.items)) {
      outputSchema.items = schema.items.map((item) =>
        isJSONSchemaObject(item)
          ? recursiveInlineAllRefs(item, rootSchema)
          : item
      );
    }
  }

  // Handle all other keys
  for (const [key, value] of Object.entries(schema)) {
    // Skip properties and items as they are handled separately above
    if (
      key === "properties" ||
      key === "required" ||
      key === "anyOf" ||
      key === "enum" ||
      key === "type" ||
      (key === "items" && outputSchema.type === "array")
    ) {
      continue;
    }
    if (isJSONSchemaObject(value)) {
      outputSchema = {
        ...outputSchema,
        [key]: recursiveInlineAllRefs(value, rootSchema),
      };
    } else {
      outputSchema = { ...outputSchema, [key]: value };
    }
  }

  return outputSchema;
}

/**
 * Inlines all references in a schema.
 * @param schema The schema to inline references in.
 * @returns The schema with all references inlined.
 */
export function inlineAllRefs(schema: JSONSchema): JSONSchema {
  return recursiveInlineAllRefs(schema, schema);
}
