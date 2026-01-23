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
import type {
  AgentConfigurationType,
  TemplateAgentConfigurationType,
} from "@app/types";

// Server vs. tool configuration.

export function isMCPServerConfiguration(
  config: MCPServerConfigurationType | MCPToolConfigurationType
): config is MCPServerConfigurationType {
  return (
    !!config &&
    typeof config === "object" &&
    "type" in config &&
    config.type === "mcp_server_configuration"
  );
}

export function isMCPToolConfiguration(
  config:
    | MCPServerConfigurationType
    | MCPToolConfigurationType
    | LightMCPToolConfigurationType
): config is MCPToolConfigurationType {
  return (
    !!config &&
    typeof config === "object" &&
    "type" in config &&
    config.type === "mcp_configuration"
  );
}

// For an MCP server configuration: server-side or client-side.

export function isServerSideMCPServerConfiguration(
  config: MCPServerConfigurationType
): config is ServerSideMCPServerConfigurationType {
  return isMCPServerConfiguration(config) && "mcpServerViewId" in config;
}

export function isClientSideMCPServerConfiguration(
  config: MCPServerConfigurationType
): config is ServerSideMCPServerConfigurationType {
  return isMCPServerConfiguration(config) && "clientSideMcpServerId" in config;
}

// For a light MCP tool configuration: server-side or client-side.

export function isLightServerSideMCPToolConfiguration(
  config: LightMCPToolConfigurationType
): config is LightServerSideMCPToolConfigurationType {
  return (
    isMCPToolConfiguration(config) &&
    "mcpServerViewId" in config &&
    !("inputSchema" in config)
  );
}

export function isLightClientSideMCPToolConfiguration(
  config: LightMCPToolConfigurationType
): config is LightClientSideMCPToolConfigurationType {
  return (
    isMCPToolConfiguration(config) &&
    "clientSideMcpServerId" in config &&
    !("inputSchema" in config)
  );
}

// For an MCP tool configuration: server-side or client-side.

export function isServerSideMCPToolConfiguration(
  config: MCPToolConfigurationType
): config is ServerSideMCPToolConfigurationType {
  return isMCPToolConfiguration(config) && "mcpServerViewId" in config;
}

export function isClientSideMCPToolConfiguration(
  config: MCPToolConfigurationType
): config is ClientSideMCPToolConfigurationType {
  return isMCPToolConfiguration(config) && "clientSideMcpServerId" in config;
}

// Internal MCP server checked by name.

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
