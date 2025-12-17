import { ActionIcons } from "@dust-tt/sparkle";

import type { SkillSelection } from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import {
  InternalActionIcons,
  isCustomResourceIconType,
} from "@app/components/resources/resources_icons";
import { getMcpServerViewDisplayName } from "@app/lib/actions/mcp_helper";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { SKILL_ICON } from "@app/lib/skill";

export function getSelectionPageTitle(
  hasSelectedActions: boolean,
  showSkills: boolean
): string {
  if (!hasSelectedActions) {
    return showSkills ? "Add capabilities" : "Add tools";
  }
  return "Add more";
}

export function getMcpInfoPageTitle(
  infoMCPServerView: MCPServerViewType | null
): string {
  if (infoMCPServerView) {
    return getMcpServerViewDisplayName(infoMCPServerView);
  }

  return "Tool information";
}

export function getMcpInfoPageDescription(
  infoMCPServerView: MCPServerViewType | null
): string {
  if (infoMCPServerView?.server.description) {
    return infoMCPServerView.server.description;
  }

  return "No description available";
}

export function getMcpInfoPageIcon(
  infoMCPServerView: MCPServerViewType | null
) {
  if (infoMCPServerView) {
    return isCustomResourceIconType(infoMCPServerView.server.icon)
      ? ActionIcons[infoMCPServerView.server.icon]
      : InternalActionIcons[infoMCPServerView.server.icon];
  }

  return undefined;
}

export function getSkillInfoPageTitle(
  infoSkill: SkillSelection | null
): string {
  return infoSkill?.name ?? "";
}

export function getSkillInfoPageDescription(
  infoSkill: SkillSelection | null
): string {
  return infoSkill?.userFacingDescription ?? "";
}

export function getSkillInfoPageIcon() {
  return SKILL_ICON;
}
