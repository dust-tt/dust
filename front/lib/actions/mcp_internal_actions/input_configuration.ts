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
  findSchemaAtPath,
  followInternalRef,
  getValueAtPath,
  isJSONSchemaObject,
  iterateOverSchemaPropertiesRecursive,
  setValueAtPath,
} from "@app/lib/utils/json_schemas";
import type {
  TimeFrame,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
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

export function isTimeFrame(value: unknown): value is TimeFrame {
  return (
    typeof value === "object" &&
    value !== null &&
    "duration" in value &&
    "unit" in value &&
    typeof value.duration === "number" &&
    typeof value.unit === "string"
  );
}

export function isJsonSchema(value: unknown): value is JSONSchema {
  // we don't need much more validation here, it's handled by the validateConfiguredJsonSchema function later
  return typeof value === "object" && value !== null;
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
          propSchema.default !== null &&
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

      assert(timeFrame, "Unreachable: missing time frame configuration.");

      const { duration, unit } = timeFrame;
      return { duration, unit, mimeType };
    }

    case INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA: {
      const { jsonSchema } = actionConfiguration;

      assert(jsonSchema, "Unreachable: missing JSON schema configuration.");

      const validationResult = validateConfiguredJsonSchema(jsonSchema);
      if (validationResult.isErr()) {
        throw validationResult.error;
      }
      return {
        jsonSchema: validationResult.value,
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
          // Handle both object-level default {values, mimeType}
          if (
            propSchema.default &&
            typeof propSchema.default === "object" &&
            propSchema.default !== null &&
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
      if (!Array.isArray(values) || values.some((v) => typeof v !== "string")) {
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
}): Record<string, { schema: JSONSchema; required: boolean }> {
  const disabledTools =
    mcpServerView.toolsMetadata
      ?.filter((tool) => !tool.enabled)
      .map((tool) => tool.toolName) ?? [];
  const mcpServer = mcpServerView.server;
  let matches: Record<string, { schema: JSONSchema; required: boolean }> = {};
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

        // We found a matching mimeType, augment the inputs
        setValueAtPath(inputs, fullPath, value);
        return false;
      }
    }
    return true;
  });

  return inputs;
}

export interface MCPServerToolsConfigurations {
  dataSourceConfigurable: "no" | "optional" | "required";
  dataWarehouseConfigurable: "no" | "optional" | "required";
  tableConfigurable: "no" | "optional" | "required";
  childAgentConfigurable: "no" | "optional" | "required";
  reasoningConfigurable: "no" | "optional" | "required";
  timeFrameConfigurable: "no" | "optional" | "required";
  jsonSchemaConfigurable: "no" | "optional" | "required";
  dustAppConfigurable: "no" | "required";
  secretConfigurable: "no" | "required";
  stringConfigurations: Record<
    string,
    {
      description?: string;
    }
  >;
  numberConfigurations: Record<
    string,
    {
      description?: string;
    }
  >;
  booleanConfigurations: Record<
    string,
    {
      description?: string;
    }
  >;
  enumConfigurations: Record<
    string,
    {
      options: { value: string; label: string; description?: string }[];
      description?: string;
    }
  >;
  listConfigurations: Record<
    string,
    {
      options: { value: string; label: string; description?: string }[];
      description?: string;
      values?: string[];
    }
  >;
  defaults: {
    stringConfigurations: Record<string, string>;
    numberConfigurations: Record<string, number>;
    booleanConfigurations: Record<string, boolean>;
    enumConfigurations: Record<string, string>;
    listConfigurations: Record<string, string[]>;
    timeFrameConfiguration?: TimeFrame;
    jsonSchemaConfiguration?: JSONSchema;
  };
  configurable: "no" | "optional" | "required";
}

export function getMCPServerToolsConfigurations(
  mcpServerView: MCPServerViewType | null | undefined,
  featureFlags?: WhitelistableFeature[]
): MCPServerToolsConfigurations {
  if (!mcpServerView) {
    return {
      dataSourceConfigurable: "no",
      dataWarehouseConfigurable: "no",
      tableConfigurable: "no",
      childAgentConfigurable: "no",
      reasoningConfigurable: "no",
      timeFrameConfigurable: "no",
      jsonSchemaConfigurable: "no",
      dustAppConfigurable: "no",
      secretConfigurable: "no",
      stringConfigurations: {},
      numberConfigurations: {},
      booleanConfigurations: {},
      enumConfigurations: {},
      listConfigurations: {},
      defaults: {
        stringConfigurations: {},
        numberConfigurations: {},
        booleanConfigurations: {},
        enumConfigurations: {},
        listConfigurations: {},
      },
      configurable: "optional",
    };
  }

  const {
    schemas: stringSchemas,
    configurations: stringConfigurations,
    defaults: stringDefaults,
  } = getSchemaConfigurationsAndDefaults(
    INTERNAL_MIME_TYPES.TOOL_INPUT.STRING,
    mcpServerView,
    isString
  );
  const {
    schemas: numberSchemas,
    configurations: numberConfigurations,
    defaults: numberDefaults,
  } = getSchemaConfigurationsAndDefaults(
    INTERNAL_MIME_TYPES.TOOL_INPUT.NUMBER,
    mcpServerView,
    (v: unknown): v is number => typeof v === "number"
  );
  const {
    schemas: booleanSchemas,
    configurations: booleanConfigurations,
    defaults: booleanDefaults,
  } = getSchemaConfigurationsAndDefaults(
    INTERNAL_MIME_TYPES.TOOL_INPUT.BOOLEAN,
    mcpServerView,
    (v: unknown): v is boolean => typeof v === "boolean",
    (key) => key !== "useSummary" || featureFlags?.includes("web_summarization")
  );

  const { schemas: enumSchemas, entries: enumEntries } = getSchemaAndEntries(
    INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
    mcpServerView
  );

  const enumConfigurations = Object.fromEntries(
    enumEntries.map(([key, entry]) => {
      const optionsProperty = entry.schema.properties?.options;
      if (!optionsProperty || !isJSONSchemaObject(optionsProperty)) {
        return [key, { options: [], description: entry.schema.description }];
      }
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
            .filter((v) => v !== null) as Array<{
            value: string;
            label: string;
            description?: string;
          }>)
        : [];

      if (options.length === 0) {
        throw new Error(`No valid enum options found for key ${key}`);
      }
      return [
        key,
        {
          options,
          description: entry.schema.description,
        },
      ];
    })
  );

  const enumDefaults = getDefaultsForEntries(
    enumEntries,
    (v: unknown): v is string => typeof v === "string"
  );
  const { schemas: listSchemas, entries: listEntries } = getSchemaAndEntries(
    INTERNAL_MIME_TYPES.TOOL_INPUT.LIST,
    mcpServerView
  );

  const listConfigurations = Object.fromEntries(
    listEntries.map(([key, entry]) => {
      const optionsProperty = entry.schema.properties?.options;
      if (!optionsProperty || !isJSONSchemaObject(optionsProperty)) {
        return [
          key,
          { options: [], values: [], description: entry.schema.description },
        ];
      }
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
            .filter((v) => v !== null) as Array<{
            value: string;
            label: string;
            description?: string;
          }>)
        : [];
      const values = Array.isArray(entry.schema.properties?.values)
        ? (entry.schema.properties.values
            .map((v) => {
              if (isString(v)) {
                return v;
              }
              return null;
            })
            .filter((v) => v !== null) as string[])
        : [];
      if (options.length === 0) {
        throw new Error(`No valid list options found for key ${key}`);
      }

      return [
        key,
        {
          options,
          values,
          description: entry.schema.description,
        },
      ];
    })
  );

  const listDefaults = getDefaultsForEntries(
    listEntries,
    (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)
  );

  const dustAppConfigurable =
    Object.keys(
      findPathsToConfiguration({
        mcpServerView,
        mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_APP,
      })
    ).length > 0
      ? "required"
      : "no";

  const secretConfigurable =
    mcpServerView.server.requiresSecret === true ? "required" : "no";

  const dataSourceConfigurable = getConfigurableStateForMimeType(
    INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_SOURCE,
    mcpServerView
  );
  const dataWarehouseConfigurable = getConfigurableStateForMimeType(
    INTERNAL_MIME_TYPES.TOOL_INPUT.DATA_WAREHOUSE,
    mcpServerView
  );
  const tableConfigurable = getConfigurableStateForMimeType(
    INTERNAL_MIME_TYPES.TOOL_INPUT.TABLE,
    mcpServerView
  );
  const childAgentConfigurable = getConfigurableStateForMimeType(
    INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT,
    mcpServerView
  );
  const reasoningConfigurable = getConfigurableStateForMimeType(
    INTERNAL_MIME_TYPES.TOOL_INPUT.REASONING_MODEL,
    mcpServerView
  );

  const { configurable: jsonSchemaConfigurable, default: jsonSchemaDefault } =
    getSchemaConfigurableAndDefault(
      INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA,
      mcpServerView,
      isJsonSchema
    );
  const { configurable: timeFrameConfigurable, default: timeFrameDefault } =
    getSchemaConfigurableAndDefault(
      INTERNAL_MIME_TYPES.TOOL_INPUT.TIME_FRAME,
      mcpServerView,
      isTimeFrame
    );

  const configurableStates = [
    dataSourceConfigurable,
    dataWarehouseConfigurable,
    tableConfigurable,
    childAgentConfigurable,
    reasoningConfigurable,
    timeFrameConfigurable,
    jsonSchemaConfigurable,
    dustAppConfigurable,
    secretConfigurable,
    getConfigurableStateForRecord(
      stringSchemas,
      stringConfigurations,
      stringDefaults
    ),
    getConfigurableStateForRecord(
      numberSchemas,
      numberConfigurations,
      numberDefaults
    ),
    getConfigurableStateForRecord(
      booleanSchemas,
      booleanConfigurations,
      booleanDefaults
    ),
    getConfigurableStateForRecord(
      enumSchemas,
      enumConfigurations,
      enumDefaults
    ),
    getConfigurableStateForRecord(
      listSchemas,
      listConfigurations,
      listDefaults
    ),
  ];

  const defaults = {
    stringConfigurations: stringDefaults,
    numberConfigurations: numberDefaults,
    booleanConfigurations: booleanDefaults,
    enumConfigurations: enumDefaults,
    listConfigurations: listDefaults,
    timeFrameConfiguration: timeFrameDefault,
    jsonSchemaConfiguration: jsonSchemaDefault,
  };

  const configurable = configurableStates.every((c) => c === "no")
    ? "no"
    : configurableStates.every((c) => c === "optional" || c === "no")
      ? "optional"
      : "required";

  return {
    dataSourceConfigurable,
    dataWarehouseConfigurable,
    tableConfigurable,
    childAgentConfigurable,
    reasoningConfigurable,
    timeFrameConfigurable,
    jsonSchemaConfigurable,
    dustAppConfigurable,
    secretConfigurable,
    stringConfigurations,
    numberConfigurations,
    booleanConfigurations,
    enumConfigurations,
    listConfigurations,
    defaults,
    configurable,
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

  if (mimeType === INTERNAL_MIME_TYPES.TOOL_INPUT.JSON_SCHEMA) {
    const mimeTypeProperty = schema.properties?.mimeType;
    if (
      schema.properties?.jsonSchema &&
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
 * @param inputSchema The schema to find matching subschemas in: it is expected to be inlined. (I.e. without $ref pointers)
 * @returns A record of property keys that match the schema comparison.
 * Empty record if no matches are found.
 */
export function findMatchingSubSchemas(
  inputSchema: JSONSchema,
  mimeType: InternalToolInputMimeType
): Record<string, { schema: JSONSchema; required: boolean }> {
  const matches: Record<string, { schema: JSONSchema; required: boolean }> = {};

  if (!isJSONSchemaObject(inputSchema)) {
    return matches;
  }

  // Check properties in object schemas
  if (inputSchema.properties) {
    for (const [key, propSchema] of Object.entries(inputSchema.properties)) {
      if (isJSONSchemaObject(propSchema)) {
        // Check if this property's schema matches the target
        if (isSchemaConfigurable(propSchema, mimeType)) {
          // When we set a type as .optional() in Zod, this removes the key from the required array.
          matches[key] = {
            schema: propSchema,
            required: inputSchema.required?.includes(key) ?? false,
          };
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
      matches[key] = {
        schema: value,
        required: inputSchema.required?.includes(key) ?? false,
      };
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

function getConfigurableStateForRecord(
  schemas: Record<string, { schema: JSONSchema; required: boolean }>,
  configurations: Record<string, unknown>,
  defaults: Record<string, unknown>
): "no" | "optional" | "required" {
  if (Object.keys(configurations).length === 0) {
    return "no";
  }

  const requiredKeys = Object.keys(configurations).filter(
    (key) => schemas[key].required
  );

  if (
    requiredKeys.every((key) => key in defaults) ||
    requiredKeys.length === 0
  ) {
    return "optional";
  }
  return "required";
}

function extractSchemaDefault<T>(
  schema: JSONSchema,
  typeGuard: (value: unknown) => value is T
): T | undefined {
  // Try object-level default first: { value: T, mimeType: "..." }
  if (
    schema.default &&
    typeof schema.default === "object" &&
    schema.default !== null &&
    "value" in schema.default &&
    typeGuard(schema.default.value)
  ) {
    return schema.default.value;
  }

  return undefined;
}

function getConfigurableStateForMimeType(
  mimeType: InternalToolInputMimeType,
  mcpServerView: MCPServerViewType
): "no" | "optional" | "required" {
  const schema = Object.values(
    findPathsToConfiguration({
      mcpServerView,
      mimeType,
    })
  ).at(0);

  if (schema && schema.schema.default !== undefined) {
    throw new Error("Defaults are not allowed for inputs");
  }

  return schema ? (schema.required ? "required" : "optional") : "no";
}

function getSchemaConfigurationsAndDefaults<T>(
  mimeType: InternalToolInputMimeType,
  mcpServerView: MCPServerViewType,
  typeGuard: (value: unknown) => value is T,
  filter?: (key: string) => boolean | undefined
): {
  schemas: Record<string, { schema: JSONSchema; required: boolean }>;
  configurations: Record<string, { description?: string }>;
  defaults: Record<string, T>;
} {
  const { schemas, entries } = getSchemaAndEntries(mimeType, mcpServerView);

  const filteredEntries = filter
    ? entries.filter(([key, _]) => filter(key))
    : entries;

  const configurations = getConfigurationsForEntries(filteredEntries);
  const defaults = getDefaultsForEntries(filteredEntries, typeGuard);

  return { schemas, configurations, defaults };
}

function getSchemaAndEntries(
  mimeType: InternalToolInputMimeType,
  mcpServerView: MCPServerViewType
): {
  schemas: Record<string, { schema: JSONSchema; required: boolean }>;
  entries: [string, { schema: JSONSchema; required: boolean }][];
} {
  const schemas = findPathsToConfiguration({
    mcpServerView,
    mimeType,
  });

  const entries = Object.entries(schemas);

  return { schemas, entries };
}

function getDefaultsForEntries<T>(
  entries: [string, { schema: JSONSchema; required: boolean }][],
  typeGuard: (value: unknown) => value is T
): Record<string, T> {
  return Object.fromEntries(
    entries
      .map(([key, entry]) => [
        key,
        extractSchemaDefault(entry.schema, typeGuard),
      ])
      .filter(([_, val]) => val !== undefined)
  );
}

function getConfigurationsForEntries(
  entries: [string, { schema: JSONSchema; required: boolean }][]
): Record<string, { description?: string }> {
  return Object.fromEntries(
    entries.map(([key, entry]) => [
      key,
      {
        description: entry.schema.description,
      },
    ])
  );
}

function getSchemaConfigurableAndDefault<T>(
  mimeType: InternalToolInputMimeType,
  mcpServerView: MCPServerViewType,
  typeGuard: (value: unknown) => value is T
): {
  configurable: "no" | "optional" | "required";
  default: T | undefined;
} {
  const schema = Object.values(
    findPathsToConfiguration({
      mcpServerView,
      mimeType,
    })
  ).at(0);

  const defaultValue = schema
    ? extractSchemaDefault(schema.schema, typeGuard)
    : undefined;

  const configurable = schema
    ? schema.required
      ? defaultValue
        ? "optional"
        : "required"
      : "optional"
    : "no";

  return { configurable, default: defaultValue };
}
