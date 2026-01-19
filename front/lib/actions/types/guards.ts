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
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import type {
  AgentConfigurationType,
  TemplateAgentConfigurationType,
} from "@app/types";

// Server vs. tool configuration.

export function isMCPServerConfiguration(
  config:
    | MCPServerConfigurationType
    | MCPToolConfigurationType
    | UnsavedMCPServerConfigurationType
): config is MCPServerConfigurationType {
  return (
    !!config &&
    typeof config === "object" &&
    "type" in config &&
    config.type === "mcp_server_configuration"
  );
}

export function isMCPToolConfiguration(
  arg:
    | MCPServerConfigurationType
    | MCPToolConfigurationType
    | LightMCPToolConfigurationType
): arg is MCPToolConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "mcp_configuration"
  );
}

// For an MCP server configuration: server-side or client-side.

export function isServerSideMCPServerConfiguration(
  arg: MCPServerConfigurationType | UnsavedMCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return isMCPServerConfiguration(arg) && "mcpServerViewId" in arg;
}

export function isClientSideMCPServerConfiguration(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return isMCPServerConfiguration(arg) && "clientSideMcpServerId" in arg;
}

// For an MCP tool configuration: server-side or client-side.

export function isServerSideMCPToolConfiguration(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "mcpServerViewId" in arg;
}

export function isClientSideMCPToolConfiguration(
  arg: MCPToolConfigurationType
): arg is ClientSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "clientSideMcpServerId" in arg;
}

// For a light tool configuration: server-side or client-side.

export function isLightServerSideMCPToolConfiguration(
  arg: LightMCPToolConfigurationType
): arg is LightServerSideMCPToolConfigurationType {
  return (
    isMCPToolConfiguration(arg) &&
    "mcpServerViewId" in arg &&
    !("inputSchema" in arg)
  );
}

export function isLightClientSideMCPToolConfiguration(
  arg: LightMCPToolConfigurationType
): arg is LightClientSideMCPToolConfigurationType {
  return (
    isMCPToolConfiguration(arg) &&
    "clientSideMcpServerId" in arg &&
    !("inputSchema" in arg)
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
