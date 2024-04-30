import type {
  DustAppRunActionType,
  DustAppRunBlockEvent,
  DustAppRunConfigurationType,
  DustAppRunParamsEvent,
} from "@app/lib/api/assistant/actions/dust_app_run/types";
import { isDustAppRunConfiguration } from "@app/lib/api/assistant/actions/dust_app_run/types";
import type {
  ProcessActionType,
  ProcessConfigurationType,
  ProcessParamsEvent,
} from "@app/lib/api/assistant/actions/process/types";
import { isProcessConfiguration } from "@app/lib/api/assistant/actions/process/types";
import type {
  RetrievalActionType,
  RetrievalConfigurationType,
  RetrievalParamsEvent,
} from "@app/lib/api/assistant/actions/retrieval/types";
import { isRetrievalConfiguration } from "@app/lib/api/assistant/actions/retrieval/types";
import type {
  TablesQueryActionType,
  TablesQueryConfigurationType,
  TablesQueryOutputEvent,
  TablesQueryParamsEvent,
} from "@app/lib/api/assistant/actions/tables_query/types";
import { isTablesQueryConfiguration } from "@app/lib/api/assistant/actions/tables_query/types";

export type AgentActionType =
  | RetrievalActionType
  | DustAppRunActionType
  | TablesQueryActionType
  | ProcessActionType;

export function isAgentConfiguration(
  arg: unknown
): arg is AgentActionConfigurationType {
  return (
    isTablesQueryConfiguration(arg) ||
    isDustAppRunConfiguration(arg) ||
    isRetrievalConfiguration(arg) ||
    isProcessConfiguration(arg)
  );
}

/**
 * Agent Action configuration
 */

// New AgentActionConfigurationType checklist:
// - Add the type to the union type below
// - Add model rendering support in `renderConversationForModel`
export type AgentActionConfigurationType =
  | TablesQueryConfigurationType
  | RetrievalConfigurationType
  | DustAppRunConfigurationType
  | ProcessConfigurationType;

export type AgentAction = AgentActionConfigurationType["type"];

// Event sent during the execution of an action. These are action specific.
export type AgentActionEvent =
  | RetrievalParamsEvent
  | DustAppRunParamsEvent
  | DustAppRunBlockEvent
  | TablesQueryParamsEvent
  | TablesQueryOutputEvent
  | ProcessParamsEvent;
