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
import { AgentActionConfigurationType } from "../../../front/assistant/agent";
import { AgentActionType } from "../../../front/assistant/conversation";

export function isTablesQueryConfiguration(
  arg: AgentActionConfigurationType | null
): arg is TablesQueryConfigurationType {
  return arg?.type === "tables_query_configuration";
}

export function isTablesQueryActionType(
  arg: AgentActionType
): arg is TablesQueryActionType {
  return arg.type === "tables_query_action";
}

export function isDustAppRunConfiguration(
  arg: AgentActionConfigurationType | null
): arg is DustAppRunConfigurationType {
  return arg !== null && arg.type && arg.type === "dust_app_run_configuration";
}

export function isDustAppRunActionType(
  arg: AgentActionType
): arg is DustAppRunActionType {
  return arg.type === "dust_app_run_action";
}

export function isRetrievalConfiguration(
  arg: AgentActionConfigurationType | null
): arg is RetrievalConfigurationType {
  return arg !== null && arg.type && arg.type === "retrieval_configuration";
}

export function isRetrievalActionType(
  arg: AgentActionType
): arg is RetrievalActionType {
  return arg.type === "retrieval_action";
}

export function isProcessConfiguration(
  arg: AgentActionConfigurationType | null
): arg is ProcessConfigurationType {
  return arg !== null && arg.type && arg.type === "process_configuration";
}

export function isProcessActionType(
  arg: AgentActionType
): arg is ProcessActionType {
  return arg.type === "process_action";
}
