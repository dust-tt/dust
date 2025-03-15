import { BaseAction } from "@app/lib/actions/types";
import type {
  BrowseActionType,
  BrowseConfigurationType,
} from "@app/lib/actions/types/browse";
import type {
  ConversationIncludeFileActionType,
  ConversationIncludeFileConfigurationType,
} from "@app/lib/actions/types/conversation/include_file";
import type {
  ProcessActionType,
  ProcessConfigurationType,
} from "@app/lib/actions/types/process";
import type { ReasoningConfigurationType } from "@app/lib/actions/types/reasoning";
import type {
  RetrievalActionType,
  RetrievalConfigurationType,
} from "@app/lib/actions/types/retrieval";
import type { SearchLabelsConfigurationType } from "@app/lib/actions/types/search_labels";
import type {
  TablesQueryActionType,
  TablesQueryConfigurationType,
} from "@app/lib/actions/types/tables_query";
import type {
  WebsearchActionType,
  WebsearchConfigurationType,
} from "@app/lib/actions/types/websearch";
import type { AgentActionType } from "@app/types";
import type {
  AgentConfigurationType,
  TemplateAgentConfigurationType,
} from "@app/types";

import type {
  DustAppRunActionType,
  DustAppRunConfigurationType,
} from "./dust_app_run";

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

export function isTablesQueryActionType(
  arg: AgentActionType
): arg is TablesQueryActionType {
  return arg.type === "tables_query_action";
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

// TODO(2024-05-14 flav) Refactor for better separation of concerns in the front-end.
export function isDustAppRunActionType(
  arg: AgentActionType
): arg is DustAppRunActionType {
  return arg.type === "dust_app_run_action";
}

// This is temporary until we refactor all action to this class structure.
export function isBaseActionClass(action: unknown): action is BaseAction {
  return action instanceof BaseAction;
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

export function isProcessActionType(
  arg: AgentActionType
): arg is ProcessActionType {
  return arg.type === "process_action";
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

export function isBrowseActionType(
  arg: AgentActionType
): arg is BrowseActionType {
  return arg.type === "browse_action";
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
  configation: AgentConfigurationType | TemplateAgentConfigurationType
) {
  configation.actions.forEach((action) => {
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

  const templateConfiguration = configation as TemplateAgentConfigurationType; // Creation
  const agentConfiguration = configation as AgentConfigurationType; // Edition

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
