import { ConversationIncludeFileActionDetails } from "@app/components/actions/conversation/include_file/IncludeFileActionDetails";
import { DustAppRunActionDetails } from "@app/components/actions/dust_app_run/DustAppRunActionDetails";
import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { ProcessActionDetails } from "@app/components/actions/process/ProcessActionDetails";
import { SearchLabelsActionDetails } from "@app/components/actions/SearchLabelsActionDetails";
import { TablesQueryActionDetails } from "@app/components/actions/tables_query/TablesQueryActionDetails";
import type { ProgressNotificationContentType } from "@app/lib/actions/mcp_internal_actions/output_schemas";
import type { AgentActionType, LightWorkspaceType } from "@app/types";
import { ACTION_RUNNING_LABELS } from "@app/types";

export interface ActionDetailsComponentBaseProps<
  T extends AgentActionType = AgentActionType,
> {
  action: T;
  owner: LightWorkspaceType;
  lastNotification: ProgressNotificationContentType | null;
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
  conversation_list_files_action: {
    detailsComponent: () => null,
    runningLabel: ACTION_RUNNING_LABELS.conversation_list_files_action,
  },
  conversation_include_file_action: {
    detailsComponent: ConversationIncludeFileActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.conversation_include_file_action,
  },
  search_labels_action: {
    detailsComponent: SearchLabelsActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.search_labels_action,
  },
  tool_action: {
    detailsComponent: MCPActionDetails,
    runningLabel: ACTION_RUNNING_LABELS.tool_action,
  },
};

export function getActionSpecification<T extends ActionType>(
  actionType: T
): ActionSpecification<Extract<AgentActionType, { type: T }>> {
  return actionsSpecification[actionType];
}
