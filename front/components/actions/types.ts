import type { AgentActionType, LightWorkspaceType } from "@dust-tt/types";
import { ACTION_RUNNING_LABELS } from "@dust-tt/types";

import { BrowseActionDetails } from "@app/components/actions/browse/BrowseActionDetails";
import { ConversationIncludeFileActionDetails } from "@app/components/actions/conversation/include_file/IncludeFileActionDetails";
import { DustAppRunActionDetails } from "@app/components/actions/dust_app_run/DustAppRunActionDetails";
import { ProcessActionDetails } from "@app/components/actions/process/ProcessActionDetails";
import { ReasoningActionDetails } from "@app/components/actions/reasoning/ReasoningActionDetails";
import { RetrievalActionDetails } from "@app/components/actions/retrieval/RetrievalActionDetails";
import { SearchLabelsActionDetails } from "@app/components/actions/SearchLabelsActionDetails";
import { TablesQueryActionDetails } from "@app/components/actions/tables_query/TablesQueryActionDetails";
import { WebsearchActionDetails } from "@app/components/actions/websearch/WebsearchActionDetails";

export interface ActionDetailsComponentBaseProps<
  T extends AgentActionType = AgentActionType,
> {
  action: T;
  owner: LightWorkspaceType;
  defaultOpen: boolean;
}

interface ActionSpecification<T extends AgentActionType> {
  runningLabel: string;
  detailsComponent: React.ComponentType<ActionDetailsComponentBaseProps<T>>;
}

type ActionType = AgentActionType["type"];

type ActionSpecifications = {
  [K in ActionType]: ActionSpecification<Extract<AgentActionType, { type: K }>>;
};

const actionsSpecification: ActionSpecifications = {
  dust_app_run_action: {
    detailsComponent: DustAppRunActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.dust_app_run_action,
  },
  process_action: {
    detailsComponent: ProcessActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.process_action,
  },
  retrieval_action: {
    detailsComponent: RetrievalActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.retrieval_action,
  },
  tables_query_action: {
    detailsComponent: TablesQueryActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.tables_query_action,
  },
  websearch_action: {
    detailsComponent: WebsearchActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.websearch_action,
  },
  browse_action: {
    detailsComponent: BrowseActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.browse_action,
  },
  conversation_list_files_action: {
    detailsComponent: () => null,
    runningLabel: ACTION_RUNNING_LABELS.conversation_list_files_action,
  },
  conversation_include_file_action: {
    detailsComponent: ConversationIncludeFileActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.conversation_include_file_action,
  },
  reasoning_action: {
    detailsComponent: ReasoningActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.reasoning_action,
  },
  search_labels_action: {
    detailsComponent: SearchLabelsActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.search_labels_action,
  },
};

export function getActionSpecification<T extends ActionType>(
  actionType: T
): ActionSpecification<Extract<AgentActionType, { type: T }>> {
  return actionsSpecification[actionType];
}
