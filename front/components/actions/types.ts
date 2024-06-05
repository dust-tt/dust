import type { AgentActionType } from "@dust-tt/types";

// TODO(2024-06-05 flav) Augment this type with their respective components.
interface ActionSpecification {
  name: string;
}

type ActionType = AgentActionType["type"];

const actionsSpecification: Record<
  AgentActionType["type"],
  ActionSpecification
> = {
  websearch_action: { name: "Search and browse the Web" },
  dust_app_run_action: { name: "Run App" },
  tables_query_action: { name: "Query Tables" },
  retrieval_action: { name: "Search Data" },
  process_action: { name: "Latest Data" },
};

export function getActionSpecification(
  actionType: ActionType
): ActionSpecification {
  return actionsSpecification[actionType];
}
