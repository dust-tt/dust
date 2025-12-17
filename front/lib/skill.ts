import { Avatar } from "@dust-tt/sparkle";
import { PuzzleIcon } from "lucide-react";
import React from "react";

import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import { framesSkill } from "@app/lib/resources/skill/global/frames";

// TODO(skills 2025-12-05): use the right icon
export const SKILL_ICON = PuzzleIcon;

export function getSkillAvatarIcon(
  iconString: string | null
): React.ComponentType<{ className?: string }> {
  if (
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
  ) {
    const icon = getIcon(iconString);
    return (props) =>
      React.createElement(Avatar, { icon, size: "sm", ...props });
  }

  return (props) =>
    React.createElement(Avatar, { icon: SKILL_ICON, size: "sm", ...props });
}

export function getSkillIcon(
  iconString: string | null
): React.ComponentType<{ className?: string }> {
  if (
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
  ) {
    return getIcon(iconString);
  }
  return SKILL_ICON;
}

const IDS_OF_SKILLS_TRIGGERING_SELECT_SPACES_OPTIONS: string[] = [
  framesSkill.sId, // TODO(skills) Remove frames from this list when we have real global skills with space selection
];

export function doesSkillTriggerSelectSpaces(sId: string): boolean {
  return IDS_OF_SKILLS_TRIGGERING_SELECT_SPACES_OPTIONS.includes(sId);
}
