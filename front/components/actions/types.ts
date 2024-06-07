import type { AgentActionType } from "@dust-tt/types";

import { DustAppRunActionDetails } from "@app/components/actions/dust_app_run/DustAppRunActionDetails";
import { RetrievalActionDetails } from "@app/components/actions/retrieval/RetrievalActionDetails";
import { TablesQueryActionDetails } from "@app/components/actions/tables_query/TablesQueryActionDetails";

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
  dust_app_run_action: {
    runningLabel: "Running App",
    detailsComponent: DustAppRunActionDetails,
  },
  process_action: { runningLabel: "Gathering latest data" },
  retrieval_action: {
    runningLabel: "Searching data",
    detailsComponent: RetrievalActionDetails,
  },
  tables_query_action: {
    runningLabel: "Querying tables",
    detailsComponent: TablesQueryActionDetails,
  },
  websearch_action: { runningLabel: "Searching the web" },
};

export function getActionSpecification<T extends ActionType>(
  actionType: T
): ActionSpecification<Extract<AgentActionType, { type: T }>> {
  return actionsSpecification[actionType];
}
