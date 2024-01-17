import {
  DustAppRunActionType,
  DustAppRunConfigurationType,
} from "../../../front/assistant/actions/dust_app_run";
import { AgentActionConfigurationType } from "../../../front/assistant/agent";
import { AgentActionType } from "../../../front/assistant/conversation";
import {
  RetrievalActionType,
  RetrievalConfigurationType,
} from "../../assistant/actions/retrieval";
import {
  TablesQueryActionType,
  TablesQueryConfigurationType,
} from "../../assistant/actions/tables_query";

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
