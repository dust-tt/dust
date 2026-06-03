import { InternalActionIcons } from "@app/components/resources/resources_icons";
import {
  getInternalMCPServerIconByName,
  getInternalMCPServerToolIcon,
  type InternalMCPServerNameType,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { Tool02V2 } from "@dust-tt/sparkle";
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
  if (step.internalMCPServerName) {
    const toolIcon = step.toolName
      ? getInternalMCPServerToolIcon(step.internalMCPServerName, step.toolName)
      : null;
    const iconName =
      toolIcon ?? getInternalMCPServerIconByName(step.internalMCPServerName);
    return InternalActionIcons[iconName];
  }
  return Tool02V2;
}
