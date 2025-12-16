import { Avatar } from "@dust-tt/sparkle";
import { PuzzleIcon } from "lucide-react";
import React from "react";

import {
  getAvatarFromIcon,
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";

// TODO(skills 2025-12-05): use the right icon
export const SKILL_ICON = PuzzleIcon;

export function getSkillAvatarIcon(
  iconString: string | null
): () => React.ReactNode {
  if (
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
  ) {
    return () => getAvatarFromIcon(iconString);
  }

  return () => React.createElement(Avatar, { icon: SKILL_ICON, size: "sm" });
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
