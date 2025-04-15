import type { BrowseConfigurationType } from "@app/lib/actions/browse";
import type {
  ConversationIncludeFileActionType,
  ConversationIncludeFileConfigurationType,
} from "@app/lib/actions/conversation/include_file";
import type { DustAppRunConfigurationType } from "@app/lib/actions/dust_app_run";
import type {
  MCPActionType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
  PlatformMCPServerConfigurationType,
  PlatformMCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type { ProcessConfigurationType } from "@app/lib/actions/process";
import type { ReasoningConfigurationType } from "@app/lib/actions/reasoning";
import type {
  RetrievalActionType,
  RetrievalConfigurationType,
} from "@app/lib/actions/retrieval";
import type { SearchLabelsConfigurationType } from "@app/lib/actions/search_labels";
import type { TablesQueryConfigurationType } from "@app/lib/actions/tables_query";
import type {
  WebsearchActionType,
  WebsearchConfigurationType,
} from "@app/lib/actions/websearch";
import type { AgentActionType } from "@app/types";
import type {
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

export function isRetrievalConfiguration(
  arg: unknown
): arg is RetrievalConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "retrieval_configuration"
  );
}

export function isRetrievalActionType(
  arg: AgentActionType
): arg is RetrievalActionType {
  return arg.type === "retrieval_action";
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

export function isWebsearchConfiguration(
  arg: unknown
): arg is WebsearchConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "websearch_configuration"
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

export function isReasoningConfiguration(
  arg: unknown
): arg is ReasoningConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "reasoning_configuration"
  );
}

export function isMCPActionType(arg: AgentActionType): arg is MCPActionType {
  return arg.type === "tool_action";
}

export function isMCPActionConfiguration(
  arg: unknown
): arg is MCPToolConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "mcp_configuration"
  );
}

export function isPlatformMCPToolConfiguration(
  action: unknown
): action is PlatformMCPToolConfigurationType {
  return isMCPActionConfiguration(action) && "mcpServerViewId" in action;
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

export function isPlatformMCPServerConfiguration(
  arg: unknown
): arg is PlatformMCPServerConfigurationType {
  return isMCPServerConfiguration(arg) && "mcpServerViewId" in arg;
}

export function isWebsearchActionType(
  arg: AgentActionType
): arg is WebsearchActionType {
  return arg.type === "websearch_action";
}

export function isBrowseConfiguration(
  arg: unknown
): arg is BrowseConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "browse_configuration"
  );
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
  configuration.actions.forEach((action) => {
    if (isProcessConfiguration(action)) {
      if (
        action.relativeTimeFrame === "auto" ||
        action.relativeTimeFrame === "none"
      ) {
        /** Should never happen as not permitted for now. */
        throw new Error(
          "Invalid configuration: process must have a definite time frame"
        );
      }
    }
  });

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
