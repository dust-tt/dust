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
import { AgentActionConfigurationType } from "../agent";

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

export function isDustAppRunActionType(
  arg: AgentActionType
): arg is DustAppRunActionType {
  return arg.type === "dust_app_run_action";
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

export function isAgentActionConfigurationType(
  arg: unknown
): arg is AgentActionConfigurationType {
  return (
    isTablesQueryConfiguration(arg) ||
    isDustAppRunConfiguration(arg) ||
    isRetrievalConfiguration(arg) ||
    isProcessConfiguration(arg)
  );
}
