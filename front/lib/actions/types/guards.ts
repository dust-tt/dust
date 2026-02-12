import type {
  ClientSideMCPToolConfigurationType,
  LightClientSideMCPToolConfigurationType,
  LightMCPToolConfigurationType,
  LightServerSideMCPToolConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
  ServerSideMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { matchesInternalMCPServerName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import type {
  AgentConfigurationType,
  TemplateAgentConfigurationType,
} from "@app/types/assistant/agent";

export function isMCPServerConfiguration(
  arg: unknown
): arg is MCPServerConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "mcp_server_configuration"
  );
}

export function isServerSideMCPServerConfiguration(
  arg: MCPServerConfigurationType | UnsavedMCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return isMCPServerConfiguration(arg) && "mcpServerViewId" in arg;
}

// MCP Tools

export function isMCPToolConfiguration(
  arg: unknown
): arg is MCPToolConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "mcp_configuration"
  );
}

export function isClientSideMCPToolConfiguration(
  arg: MCPToolConfigurationType
): arg is ClientSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "clientSideMcpServerId" in arg;
}

export function isServerSideMCPToolConfiguration(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "mcpServerViewId" in arg;
}

// Light tool configuration.

export function isLightServerSideMCPToolConfiguration(
  arg: unknown
): arg is LightServerSideMCPToolConfigurationType {
  return (
    isMCPToolConfiguration(arg) &&
    "mcpServerViewId" in arg &&
    !("inputSchema" in arg)
  );
}

export function isLightClientSideMCPToolConfiguration(
  arg: unknown
): arg is LightClientSideMCPToolConfigurationType {
  return (
    isMCPToolConfiguration(arg) &&
    "clientSideMcpServerId" in arg &&
    !("inputSchema" in arg)
  );
}

export function isLightMCPToolConfiguration(
  arg: unknown
): arg is LightMCPToolConfigurationType {
  return (
    isLightServerSideMCPToolConfiguration(arg) ||
    isLightClientSideMCPToolConfiguration(arg)
  );
}

// Internal (server-side) MCP server checked by name.

export function isServerSideMCPServerConfigurationWithName(
  config: MCPServerConfigurationType,
  name: InternalMCPServerNameType
): config is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(config) &&
    matchesInternalMCPServerName(config.internalMCPServerId, name)
  );
}

export function isServerSideMCPToolConfigurationWithName(
  config: MCPToolConfigurationType,
  name: InternalMCPServerNameType
): config is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(config) &&
    matchesInternalMCPServerName(config.internalMCPServerId, name)
  );
}

export function areDataSourcesConfigured(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    !!arg.dataSources &&
    arg.dataSources.length > 0
  );
}

export function throwIfInvalidAgentConfiguration(
  configuration: AgentConfigurationType | TemplateAgentConfigurationType
) {
  const templateConfiguration = configuration as TemplateAgentConfigurationType; // Creation
  const agentConfiguration = configuration as AgentConfigurationType; // Edition

  if (templateConfiguration) {
    if (templateConfiguration.scope === "global") {
      throw new Error("Cannot create global agent");
    }
  }

  if (agentConfiguration) {
    if (agentConfiguration.scope === "global") {
      throw new Error("Cannot edit global agent");
    }

    if (agentConfiguration.status === "archived") {
      throw new Error("Cannot edit archived agent");
    }
  }
}
