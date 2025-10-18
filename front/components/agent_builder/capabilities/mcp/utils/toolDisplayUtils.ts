import { ActionIcons, BookOpenIcon } from "@dust-tt/sparkle";

import type { SelectedTool } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";

export function getSelectedToolIcon(tool: SelectedTool): React.ComponentType {
  return isCustomResourceIconType(tool.view.server.icon)
    ? ActionIcons[tool.view.server.icon]
    : InternalActionIcons[tool.view.server.icon] || BookOpenIcon;
}

export function getSelectedToolLabel(tool: SelectedTool): string {
  return getMcpServerViewDisplayName(tool.view);
}
