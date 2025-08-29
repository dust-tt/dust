import type {
  ClientSideMCPToolConfigurationType,
  LightClientSideMCPToolConfigurationType,
  LightMCPToolConfigurationType,
  LightServerSideMCPToolConfigurationType,
  MCPActionType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
  ServerSideMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import type {
  AgentConfigurationType,
  DustAppRunConfigurationType,
  TemplateAgentConfigurationType,
} from "@app/types";

export function isDustAppRunConfiguration(
  arg: unknown
): arg is DustAppRunConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "dust_app_run_configuration"
  );
}

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

export function isMCPConfigurationWithDataSource(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    !!arg.dataSources &&
    arg.dataSources.length > 0
  );
}

export function isMCPConfigurationForInternalContentCreation(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "content_creation")
  );
}

export function isMCPConfigurationForInternalWebsearch(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    (isInternalMCPServerOfName(
      arg.internalMCPServerId,
      "web_search_&_browse"
    ) ||
      isInternalMCPServerOfName(
        arg.internalMCPServerId,
        "web_search_&_browse_with_summary"
      ))
  );
}

export function isMCPConfigurationForInternalSlack(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "slack")
  );
}

export function isMCPConfigurationForInternalNotion(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "notion")
  );
}

export function isMCPConfigurationForDustAppRun(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "run_dust_app")
  );
}

export function isMCPConfigurationForAgentMemory(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "agent_memory")
  );
}

export function isMCPConfigurationForRunAgent(
  arg: MCPServerConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "run_agent")
  );
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

export function isMCPInternalSearch(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "search")
  );
}

export function isMCPInternalInclude(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "include_data")
  );
}

export function isMCPInternalDataSourceFileSystem(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(
      arg.internalMCPServerId,
      "data_sources_file_system"
    )
  );
}

export function isMCPInternalWebsearch(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    (isInternalMCPServerOfName(
      arg.internalMCPServerId,
      "web_search_&_browse"
    ) ||
      isInternalMCPServerOfName(
        arg.internalMCPServerId,
        "web_search_&_browse_with_summary"
      ))
  );
}

export function isMCPInternalRunAgent(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "run_agent")
  );
}

export function isMCPInternalSlack(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "slack")
  );
}

export function isMCPInternalNotion(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "notion")
  );
}

export function isMCPInternalDustAppRun(
  arg: LightMCPToolConfigurationType
): arg is LightServerSideMCPToolConfigurationType {
  return (
    isLightServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "run_dust_app")
  );
}

export function isServerSideMCPToolConfiguration(
  arg: MCPToolConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "mcpServerViewId" in arg;
}

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

export function isClientSideMCPToolConfiguration(
  arg: MCPToolConfigurationType
): arg is ClientSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "clientSideMcpServerId" in arg;
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

// TODO: replace with a typeguard AgentMCPActionWithOutputType.
function isMCPActionType(action: unknown): action is MCPActionType {
  return (
    typeof action === "object" &&
    action !== null &&
    "id" in action &&
    typeof action.id === "number" &&
    "agentMessageId" in action &&
    typeof action.agentMessageId === "number" &&
    "output" in action &&
    "step" in action &&
    typeof action.step === "number" &&
    "citationsAllocated" in action &&
    typeof action.citationsAllocated === "number"
  );
}

// TODO: replace with a typeguard on AgentMCPActionWithOutputType.
export function isMCPActionArray(actions: unknown): actions is MCPActionType[] {
  return Array.isArray(actions) && actions.every(isMCPActionType);
}
