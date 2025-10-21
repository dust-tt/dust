import { ActionIcons, BookOpenIcon } from "@dust-tt/sparkle";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import type { ActionSpecification } from "@app/components/agent_builder/types";
import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";

export function getSelectedToolIcon(tool: SelectedTool): React.ComponentType {
  if (tool.type === "DATA_VISUALIZATION") {
    return DATA_VISUALIZATION_SPECIFICATION.dropDownIcon;
  }

  return isCustomResourceIconType(tool.view.server.icon)
    ? ActionIcons[tool.view.server.icon]
    : InternalActionIcons[tool.view.server.icon] || BookOpenIcon;
}

export function getSelectedToolLabel(
  tool: SelectedTool,
  dataVisualization?: ActionSpecification | null
): string {
  if (tool.type === "DATA_VISUALIZATION") {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return dataVisualization?.label || "";
  }

  return getMcpServerViewDisplayName(tool.view);
}
