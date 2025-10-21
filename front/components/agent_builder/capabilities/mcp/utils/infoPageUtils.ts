import { ActionIcons } from "@dust-tt/sparkle";

import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";

export function getInfoPageTitle(
  infoMCPServerView: MCPServerViewType | null,
  infoAction: AgentBuilderAction | null
): string {
  if (infoMCPServerView) {
    return getMcpServerViewDisplayName(infoMCPServerView);
  }

  if (infoAction?.type === "DATA_VISUALIZATION") {
    return DATA_VISUALIZATION_SPECIFICATION.label;
  }

  return "Tool information";
}

export function getInfoPageDescription(
  infoMCPServerView: MCPServerViewType | null,
  infoAction: AgentBuilderAction | null
): string {
  if (infoMCPServerView?.server.description) {
    return infoMCPServerView.server.description;
  }

  if (infoAction?.type === "DATA_VISUALIZATION") {
    return DATA_VISUALIZATION_SPECIFICATION.description;
  }

  return "No description available";
}

export function getInfoPageIcon(
  infoMCPServerView: MCPServerViewType | null,
  infoAction: AgentBuilderAction | null
) {
  if (infoMCPServerView) {
    return isCustomResourceIconType(infoMCPServerView.server.icon)
      ? ActionIcons[infoMCPServerView.server.icon]
      : InternalActionIcons[infoMCPServerView.server.icon];
  }

  if (infoAction?.type === "DATA_VISUALIZATION") {
    return DATA_VISUALIZATION_SPECIFICATION.cardIcon;
  }

  return undefined;
}
