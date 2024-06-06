import type { AgentActionType } from "@dust-tt/types";

import { RetrievalActionDetails } from "@app/components/actions/retrieval/RetrievalAction";

export interface ActionDetailsComponentBaseProps<
  T extends AgentActionType = AgentActionType
> {
  action: T;
  defaultOpen: boolean;
}

interface ActionSpecification {
  runningLabel: string;
  detailsComponent?: React.ComponentType<ActionDetailsComponentBaseProps>;
}

type ActionType = AgentActionType["type"];

const actionsSpecification: Record<
  AgentActionType["type"],
  ActionSpecification
> = {
  dust_app_run_action: { runningLabel: "Running App" },
  process_action: { runningLabel: "Gathering latest data" },
  retrieval_action: {
    runningLabel: "Searching data",
    detailsComponent: RetrievalActionDetails,
  },
  tables_query_action: { runningLabel: "Querying tables" },
  websearch_action: { runningLabel: "Searching the web" },
};

export function getActionSpecification(
  actionType: ActionType
): ActionSpecification {
  return actionsSpecification[actionType];
}
