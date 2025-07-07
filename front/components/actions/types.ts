import { MCPActionDetails } from "@app/components/actions/mcp/details/MCPActionDetails";
import { SearchLabelsActionDetails } from "@app/components/actions/SearchLabelsActionDetails";
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
