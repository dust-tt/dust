import {
  DustAppRunActionType,
  DustAppRunConfigurationType,
} from "../../../front/assistant/actions/dust_app_run";
import {
  ProcessActionType,
  ProcessConfigurationType,
} from "../../../front/assistant/actions/process";
import {
  RetrievalActionType,
  RetrievalConfigurationType,
} from "../../../front/assistant/actions/retrieval";
import {
  TablesQueryActionType,
  TablesQueryConfigurationType,
} from "../../../front/assistant/actions/tables_query";
import { AgentActionType } from "../../../front/assistant/conversation";
import { BaseAction } from "../../../front/lib/api/assistant/actions/index";
import { BrowseActionType, BrowseConfigurationType } from "./browse";
import { WebsearchActionType, WebsearchConfigurationType } from "./websearch";

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
