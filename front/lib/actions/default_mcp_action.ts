import {
  DEFAULT_MCP_ACTION_DESCRIPTION,
  DEFAULT_MCP_ACTION_NAME,
} from "@app/lib/actions/constants";
import { getMcpServerViewDescription } from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import type { AgentConfigurationAssistantPayload } from "@app/types/api/agent_configuration";

// The defaults of an action created for a tool, shared by the agent builder (when a tool is picked)
// and by the server (when an accepted suggestion adds a tool to an agent).

type AgentActionPayload = AgentConfigurationAssistantPayload["actions"][number];

// Convert display format name back to storage format
export function nameToStorageFormat(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, ""); // Remove any non-alphanumeric characters except underscores
}

/** The tool's name in storage format, which always matches the action name regex (^[a-z0-9_]+$). */
export function getDefaultMCPActionName(
  mcpServerView: MCPServerViewType
): string {
  const rawName = mcpServerView.name ?? mcpServerView.server.name;
  return rawName ? nameToStorageFormat(rawName) : "";
}

/** Empty for tools whose description depends on the knowledge they are configured with. */
export function getDefaultMCPActionDescription(
  mcpServerView: MCPServerViewType
): string {
  const {
    requiresDataSourceConfiguration,
    requiresDataWarehouseConfiguration,
    requiresTableConfiguration,
  } = getMCPServerRequirements(mcpServerView);

  return requiresDataSourceConfiguration ||
    requiresDataWarehouseConfiguration ||
    requiresTableConfiguration
    ? ""
    : getMcpServerViewDescription(mcpServerView);
}

/**
 * The default values of the tool's configurable inputs, keyed by their dot-separated path as stored
 * (see `processAdditionalConfiguration`). Inputs without a default are left unset.
 */
export function getDefaultAdditionalConfiguration(
  mcpServerView: MCPServerViewType
): AdditionalConfigurationType {
  const {
    requiredLists,
    requiredEnums,
    requiredBooleans,
    requiredStrings,
    requiredNumbers,
  } = getMCPServerRequirements(mcpServerView);

  const additionalConfiguration: AdditionalConfigurationType = {};

  for (const { key, default: defaultValue } of requiredBooleans) {
    additionalConfiguration[key] = defaultValue ?? false;
  }

  for (const [key, { options, default: defaultValue }] of Object.entries(
    requiredEnums
  )) {
    if (defaultValue !== null) {
      additionalConfiguration[key] = defaultValue;
    } else if (options.length > 0) {
      additionalConfiguration[key] = options[0].value;
    }
  }

  for (const [key, { default: defaultValue }] of Object.entries(
    requiredLists
  )) {
    additionalConfiguration[key] = defaultValue !== null ? [defaultValue] : [];
  }

  for (const { key, default: defaultValue } of requiredStrings) {
    if (defaultValue !== null) {
      additionalConfiguration[key] = defaultValue;
    }
  }

  for (const { key, default: defaultValue } of requiredNumbers) {
    if (defaultValue !== null) {
      additionalConfiguration[key] = defaultValue;
    }
  }

  return additionalConfiguration;
}

function uniqueActionName(baseName: string, takenNames: Set<string>): string {
  let name = baseName;
  for (let index = 2; takenNames.has(name); index++) {
    name = `${baseName}_${index}`;
  }
  return name;
}

/**
 * The action saved for a tool added with its defaults, as the agent builder saves a picked tool.
 * Only meant for tools that need no configuration (`getMCPServerRequirements(...).noRequirement`),
 * or for the `run_agent` tool with the `childAgent` it runs, named after it as the builder names a
 * sub-agent action: knowledge, time frame, JSON schema, Dust app, secret and project are left
 * unset. Where the builder would ask the user, the name and description fall back to defaults, and
 * the name is made unique among `takenNames`. The description is kept as is: the save only stores
 * it when it differs from the server's own.
 */
export function getDefaultMCPActionPayload(
  mcpServerView: MCPServerViewType,
  {
    takenNames,
    childAgent,
  }: {
    takenNames: Set<string>;
    childAgent?: { sId: string; name: string };
  }
): AgentActionPayload {
  const baseName = childAgent
    ? nameToStorageFormat(`run_${childAgent.name}`)
    : getDefaultMCPActionName(mcpServerView);

  return {
    type: "mcp_server_configuration",
    mcpServerViewId: mcpServerView.sId,
    name: uniqueActionName(baseName || DEFAULT_MCP_ACTION_NAME, takenNames),
    description:
      getDefaultMCPActionDescription(mcpServerView) ||
      DEFAULT_MCP_ACTION_DESCRIPTION,
    dataSources: null,
    tables: null,
    childAgentId: childAgent?.sId ?? null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: getDefaultAdditionalConfiguration(mcpServerView),
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
  };
}
