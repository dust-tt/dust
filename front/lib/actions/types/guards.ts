import type {
  ConversationIncludeFileActionType,
  ConversationIncludeFileConfigurationType,
} from "@app/lib/actions/conversation/include_file";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import type {
  ClientSideMCPToolConfigurationType,
  MCPActionType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  ServerSideMCPServerConfigurationType,
  ServerSideMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import { isInternalMCPServerOfName } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ProcessConfigurationType } from "@app/lib/actions/process";
import type { SearchLabelsConfigurationType } from "@app/lib/actions/search_labels";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import type {
  ActionConfigurationType,
  AgentActionConfigurationType,
  UnsavedAgentActionConfigurationType,
} from "@app/lib/actions/types/agent";
import type {
  AgentActionType,
  AgentConfigurationType,
  TemplateAgentConfigurationType,
} from "@app/types";

export function isTablesQueryConfiguration(
  arg: unknown
): arg is TablesQueryConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "tables_query_configuration"
  );
}

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

export function isProcessConfiguration(
  arg: unknown
): arg is ProcessConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "process_configuration"
  );
}

export function isSearchLabelsConfiguration(
  arg: unknown
): arg is SearchLabelsConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "search_labels_configuration"
  );
}

export function isMCPActionType(arg: AgentActionType): arg is MCPActionType {
  return arg.type === "tool_action";
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
  arg: MCPServerConfigurationType | UnsavedAgentActionConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return isMCPServerConfiguration(arg) && "mcpServerViewId" in arg;
}

export function isMCPConfigurationWithDataSource(
  arg: AgentActionConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    !!arg.dataSources &&
    arg.dataSources.length > 0
  );
}

export function isMCPConfigurationForInternalWebsearch(
  arg: AgentActionConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "web_search_&_browse")
  );
}

export function isMCPConfigurationForInternalSlack(
  arg: AgentActionConfigurationType
): arg is ServerSideMCPServerConfigurationType {
  return (
    isServerSideMCPServerConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "slack")
  );
}

export function isMCPConfigurationForInternalNotion(
  arg: AgentActionConfigurationType
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
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "search")
  );
}

export function isMCPInternalInclude(
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "include_data")
  );
}

export function isMCPInternalDataSourceFileSystem(
  arg: ActionConfigurationType
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
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "web_search_&_browse")
  );
}

export function isMCPInternalSlack(
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "slack")
  );
}

export function isMCPInternalNotion(
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "notion")
  );
}

export function isMCPInternalDustAppRun(
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return (
    isServerSideMCPToolConfiguration(arg) &&
    isInternalMCPServerOfName(arg.internalMCPServerId, "run_dust_app")
  );
}

export function isServerSideMCPToolConfiguration(
  arg: ActionConfigurationType
): arg is ServerSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "mcpServerViewId" in arg;
}

export function isClientSideMCPToolConfiguration(
  arg: ActionConfigurationType
): arg is ClientSideMCPToolConfigurationType {
  return isMCPToolConfiguration(arg) && "clientSideMcpServerId" in arg;
}

export function isConversationIncludeFileConfiguration(
  arg: unknown
): arg is ConversationIncludeFileConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "conversation_include_file_configuration"
  );
}

export function isConversationIncludeFileConfigurationActionType(
  arg: AgentActionType
): arg is ConversationIncludeFileActionType {
  return arg.type === "conversation_include_file_action";
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
