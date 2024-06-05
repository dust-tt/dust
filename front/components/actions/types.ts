import type { AgentActionType } from "@dust-tt/types";

// TODO(2024-06-05 flav) Augment this type with their respective components.
interface ActionSpecification {
  runningLabel: string;
}

type ActionType = AgentActionType["type"];

const actionsSpecification: Record<
  AgentActionType["type"],
  ActionSpecification
> = {
  dust_app_run_action: { runningLabel: "Running App" },
  process_action: { runningLabel: "Gathering latest data" },
  retrieval_action: { runningLabel: "Searching data" },
  tables_query_action: { runningLabel: "Querying tables" },
  websearch_action: { runningLabel: "Searching the web" },
};

export function getActionSpecification(
  actionType: ActionType
): ActionSpecification {
  return actionsSpecification[actionType];
}
