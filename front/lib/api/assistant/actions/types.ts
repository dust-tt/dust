import type {
  DustAppRunActionType,
  DustAppRunConfigurationType,
} from "@app/lib/api/assistant/actions/dust_app_run/types";
import { isDustAppRunConfiguration } from "@app/lib/api/assistant/actions/dust_app_run/types";
import type { ProcessActionType } from "@app/lib/api/assistant/actions/process/types";
import type {
  RetrievalActionType,
  RetrievalConfigurationType,
} from "@app/lib/api/assistant/actions/retrieval/types";
import { isRetrievalConfiguration } from "@app/lib/api/assistant/actions/retrieval/types";
import type { TablesQueryActionType } from "@app/lib/api/assistant/actions/tables_query/types";

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
