import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { ActionIcons } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export function getInfoPageTitle(
  infoMCPServerView: MCPServerViewType | null,
  t: (descriptor: MessageDescriptor) => string
): string {
  if (infoMCPServerView) {
    return getMcpServerViewDisplayName(infoMCPServerView);
  }

  return t(msg`Tool information`);
}

export function getInfoPageDescription(
  infoMCPServerView: MCPServerViewType | null,
  t: (descriptor: MessageDescriptor) => string
): string {
  if (infoMCPServerView?.server.description) {
    return infoMCPServerView.server.description;
  }

  return t(msg`No description available`);
}

export function getInfoPageIcon(infoMCPServerView: MCPServerViewType | null) {
  if (infoMCPServerView) {
    return isCustomResourceIconType(infoMCPServerView.server.icon)
      ? ActionIcons[infoMCPServerView.server.icon]
      : InternalActionIcons[infoMCPServerView.server.icon];
  }

  return undefined;
}
