import { ActionIcons } from "@dust-tt/sparkle";

import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";

export function getInfoPageTitle(
  infoMCPServerView: MCPServerViewType | null
): string {
  if (infoMCPServerView) {
    return getMcpServerViewDisplayName(infoMCPServerView);
  }

  return "Tool information";
}

export function getInfoPageDescription(
  infoMCPServerView: MCPServerViewType | null
): string {
  if (infoMCPServerView?.server.description) {
    return infoMCPServerView.server.description;
  }

  return "No description available";
}

export function getInfoPageIcon(infoMCPServerView: MCPServerViewType | null) {
  if (infoMCPServerView) {
    return isCustomResourceIconType(infoMCPServerView.server.icon)
      ? ActionIcons[infoMCPServerView.server.icon]
      : InternalActionIcons[infoMCPServerView.server.icon];
  }

  return undefined;
}
