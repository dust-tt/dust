import set from "lodash/set";

import type {
  AdditionalConfigurationInBuilderType,
  MCPServerConfigurationType,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getMCPServerToolsConfigurations } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { parseAgentConfigurationUri } from "@app/lib/actions/mcp_internal_actions/servers/webtools_edge";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type {
  ModelIdType,
  ModelProviderIdType,
  ReasoningEffortIdType,
} from "@app/types/assistant/assistant";
import {
  MODEL_IDS,
  MODEL_PROVIDER_IDS,
  REASONING_EFFORT_IDS,
} from "@app/types/assistant/assistant";

/**
 * Type guard to validate reasoning model default values against schema constraints
 * Returns a properly typed reasoning model object that matches the schema requirements
 */
function getValidatedReasoningModel(value: unknown): {
  modelId: ModelIdType;
  providerId: ModelProviderIdType;
  temperature: number | null;
  reasoningEffort: ReasoningEffortIdType | null;
} | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const obj = value as Record<string, unknown>;

  // Validate required fields
  if (
    typeof obj.modelId !== "string" ||
    !MODEL_IDS.includes(obj.modelId as ModelIdType) ||
    typeof obj.providerId !== "string" ||
    !MODEL_PROVIDER_IDS.includes(obj.providerId as ModelProviderIdType)
  ) {
    return null;
  }

  // Validate optional temperature
  const temperature =
    typeof obj.temperature === "number" &&
    obj.temperature >= 0 &&
    obj.temperature <= 1
      ? obj.temperature
      : null;

  // Validate optional reasoningEffort
  const reasoningEffort =
    typeof obj.reasoningEffort === "string" &&
    REASONING_EFFORT_IDS.includes(obj.reasoningEffort as ReasoningEffortIdType)
      ? (obj.reasoningEffort as ReasoningEffortIdType)
      : null;

  return {
    modelId: obj.modelId as ModelIdType,
    providerId: obj.providerId as ModelProviderIdType,
    temperature,
    reasoningEffort,
  };
}

/**
 * Creates default configuration values for MCP server based on requirements
 * @param mcpServerView - The MCP server view to create defaults for
 * @returns Default configuration object
 */
export function getDefaultConfiguration(
  mcpServerView?: MCPServerViewType | null
): MCPServerConfigurationType {
  const toolsConfigurations = mcpServerView
    ? getMCPServerToolsConfigurations(mcpServerView)
    : null;

  const reasoningDefault = toolsConfigurations?.reasoningConfiguration?.default;
  const validatedReasoningModel = getValidatedReasoningModel(reasoningDefault);

  const childAgentDefaultId = toolsConfigurations?.childAgentConfiguration
    ?.default?.uri
    ? (parseAgentConfigurationUri(
        toolsConfigurations?.childAgentConfiguration?.default?.uri
      ) ?? null)
    : null;

  const defaults: MCPServerConfigurationType = {
    mcpServerViewId: mcpServerView?.sId ?? "not-a-valid-sId",
    dataSourceConfigurations: null,
    tablesConfigurations: null,
    childAgentId: childAgentDefaultId,
    reasoningModel: validatedReasoningModel,
    timeFrame: null,
    additionalConfiguration: {},
    dustAppConfiguration: null,
    jsonSchema: null,
    _jsonSchemaString: null,
    secretName: null,
  };

  if (!toolsConfigurations) {
    return defaults;
  }

  const additionalConfig: AdditionalConfigurationInBuilderType = {};

  //const childAgentId = toolsConfigurations.childAgentConfiguration?.default ?? null;

  // Set default values for all configuration types when available
  // This provides better UX by pre-filling known defaults while still allowing
  // validation to catch truly missing required fields

  // Boolean configurations: use explicit default or fallback to false
  for (const {
    key,
    default: defaultValue,
  } of toolsConfigurations.booleanConfigurations) {
    set(
      additionalConfig,
      key,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      defaultValue !== undefined ? defaultValue : false
    );
  }

  // Enum configurations: use explicit default or fallback to first option
  for (const [
    key,
    { options: enumOptions, default: defaultValue },
  ] of Object.entries(toolsConfigurations.enumConfigurations)) {
    if (defaultValue !== undefined) {
      set(additionalConfig, key, defaultValue);
    } else if (enumOptions.length > 0) {
      set(additionalConfig, key, enumOptions[0].value);
    }
  }

  // List configurations: use explicit default or fallback to empty array
  for (const [key, { default: defaultValue }] of Object.entries(
    toolsConfigurations.listConfigurations
  )) {
    set(
      additionalConfig,
      key,
      defaultValue !== undefined ? [defaultValue] : []
    );
  }

  // String configurations: set defaults when available
  for (const {
    key,
    default: defaultValue,
  } of toolsConfigurations.stringConfigurations) {
    if (defaultValue !== undefined) {
      set(additionalConfig, key, defaultValue);
    }
  }

  // Number configurations: set defaults when available
  for (const {
    key,
    default: defaultValue,
  } of toolsConfigurations.numberConfigurations) {
    if (defaultValue !== undefined) {
      set(additionalConfig, key, defaultValue);
    }
  }

  defaults.additionalConfiguration = additionalConfig;

  return defaults;
}

/**
 * Creates default form values with proper configuration
 * @param mcpServerView - The MCP server view
 * @returns Default form data object
 */
export function getDefaultFormValues(mcpServerView: MCPServerViewType | null) {
  const config = getDefaultConfiguration(mcpServerView);
  const result = {
    name: "",
    description: "",
    configuration: config,
  };

  return result;
}
