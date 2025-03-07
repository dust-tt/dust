import {
  BrowseActionType,
  BrowseConfigurationType,
} from "../../../front/assistant/actions/browse";
import {
  ConversationIncludeFileActionType,
  ConversationIncludeFileConfigurationType,
} from "../../../front/assistant/actions/conversation/include_file";
import {
  DustAppRunActionType,
  DustAppRunConfigurationType,
} from "../../../front/assistant/actions/dust_app_run";
import {
  GithubCreateIssueConfigurationType,
  GithubGetPullRequestConfigurationType,
} from "../../../front/assistant/actions/github";
import { BaseAction } from "../../../front/assistant/actions/index";
import {
  ProcessActionType,
  ProcessConfigurationType,
} from "../../../front/assistant/actions/process";
import { ReasoningConfigurationType } from "../../../front/assistant/actions/reasoning";
import {
  RetrievalActionType,
  RetrievalConfigurationType,
} from "../../../front/assistant/actions/retrieval";
import {
  TablesQueryActionType,
  TablesQueryConfigurationType,
} from "../../../front/assistant/actions/tables_query";
import {
  WebsearchActionType,
  WebsearchConfigurationType,
} from "../../../front/assistant/actions/websearch";
import {
  AgentConfigurationType,
  TemplateAgentConfigurationType,
} from "../../../front/assistant/agent";
import { AgentActionType } from "../../../front/assistant/conversation";
import { SearchLabelsConfigurationType } from "./search_labels";

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

export function isGithubGetPullRequestConfiguration(
  arg: unknown
): arg is GithubGetPullRequestConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "github_get_pull_request_configuration"
  );
}

export function isGithubGetPullRequestActionType(
  arg: AgentActionType
): arg is BrowseActionType {
  return arg.type === "github_get_pull_request_action";
}

export function isGithubCreateIssueConfiguration(
  arg: unknown
): arg is GithubCreateIssueConfigurationType {
  return (
    !!arg &&
    typeof arg === "object" &&
    "type" in arg &&
    arg.type === "github_create_issue_configuration"
  );
}

export function isGithubCreateIssueActionType(
  arg: AgentActionType
): arg is BrowseActionType {
  return arg.type === "github_create_issue_action";
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
