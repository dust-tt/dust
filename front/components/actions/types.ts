import type { AgentActionType } from "@dust-tt/types";

import { BrowseActionDetails } from "@app/components/actions/browse/BrowseActionDetails";
import { DustAppRunActionDetails } from "@app/components/actions/dust_app_run/DustAppRunActionDetails";
import { ProcessActionDetails } from "@app/components/actions/process/ProcessActionDetails";
import { RetrievalActionDetails } from "@app/components/actions/retrieval/RetrievalActionDetails";
import { TablesQueryActionDetails } from "@app/components/actions/tables_query/TablesQueryActionDetails";
import { WebsearchActionDetails } from "@app/components/actions/websearch/WebsearchActionDetails";

export interface ActionDetailsComponentBaseProps<
  T extends AgentActionType = AgentActionType,
> {
  action: T;
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
    runningLabel: "Running App",
  },
  process_action: {
    detailsComponent: ProcessActionDetails,
    runningLabel: "Extracting data",
  },
  retrieval_action: {
    detailsComponent: RetrievalActionDetails,
    runningLabel: "Searching data",
  },
  tables_query_action: {
    detailsComponent: TablesQueryActionDetails,
    runningLabel: "Querying tables",
  },
  websearch_action: {
    detailsComponent: WebsearchActionDetails,
    runningLabel: "Searching the web",
  },
  browse_action: {
    detailsComponent: BrowseActionDetails,
    runningLabel: "Browsing page",
  },
};

export function getActionSpecification<T extends ActionType>(
  actionType: T
): ActionSpecification<Extract<AgentActionType, { type: T }>> {
  return actionsSpecification[actionType];
}
