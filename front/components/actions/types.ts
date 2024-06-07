import type { AgentActionType } from "@dust-tt/types";

import { RetrievalActionDetails } from "@app/components/actions/retrieval/RetrievalAction";

export interface ActionDetailsComponentBaseProps<
  T extends AgentActionType = AgentActionType
> {
  action: T;
  defaultOpen: boolean;
}

interface ActionSpecification<T extends AgentActionType> {
  runningLabel: string;
  detailsComponent?: React.ComponentType<ActionDetailsComponentBaseProps<T>>;
}

type ActionType = AgentActionType["type"];

type ActionSpecifications = {
  [K in ActionType]: ActionSpecification<Extract<AgentActionType, { type: K }>>;
};

const actionsSpecification: ActionSpecifications = {
  dust_app_run_action: { runningLabel: "Running App" },
  process_action: { runningLabel: "Gathering latest data" },
  retrieval_action: {
    runningLabel: "Searching data",
    detailsComponent: RetrievalActionDetails,
  },
  tables_query_action: { runningLabel: "Querying tables" },
  websearch_action: { runningLabel: "Searching the web" },
};

export function getActionSpecification<T extends ActionType>(
  actionType: T
): ActionSpecification<Extract<AgentActionType, { type: T }>> {
  return actionsSpecification[actionType];
}
