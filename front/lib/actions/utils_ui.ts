import type { ActionSpecification } from "@app/components/agent_builder/types";
import { Tool02V2 } from "@dust-tt/sparkle";

export const MCP_SPECIFICATION: ActionSpecification = {
  label: "More...",
  description: "Add additional sets of tools",
  cardIcon: Tool02V2,
  dropDownIcon: Tool02V2,
  flag: null,
};
