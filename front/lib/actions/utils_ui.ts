import type { ActionSpecification } from "@app/components/agent_builder/types";
import { ShapesPlusV2 } from "@dust-tt/sparkle";

export const MCP_SPECIFICATION: ActionSpecification = {
  label: "More...",
  description: "Add additional sets of tools",
  cardIcon: ShapesPlusV2,
  dropDownIcon: ShapesPlusV2,
  flag: null,
};
