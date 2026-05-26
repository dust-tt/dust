import { InternalActionIcons } from "@app/components/resources/resources_icons";
import {
  getInternalMCPServerIconByName,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { GlobeAltIcon, ToolsIcon } from "@dust-tt/sparkle";
import type React from "react";

export function getCollapseAnimationStyle(
  isCollapsed: boolean
): React.CSSProperties {
  return {
    gridTemplateRows: isCollapsed ? "0fr" : "1fr",
    opacity: isCollapsed ? 0 : 1,
    transition: isCollapsed
      ? "grid-template-rows 280ms ease, opacity 280ms"
      : "grid-template-rows 200ms ease-in",
  };
}

export function getActionStepIcon(step: {
  internalMCPServerName: InternalMCPServerNameType | null;
  toolName: string | null;
}): React.ComponentType<{ className?: string }> {
  if (
    step.internalMCPServerName === "sandbox" &&
    step.toolName === "add_egress_domain"
  ) {
    return GlobeAltIcon;
  }
  if (step.internalMCPServerName) {
    return InternalActionIcons[
      getInternalMCPServerIconByName(step.internalMCPServerName)
    ];
  }
  return ToolsIcon;
}
