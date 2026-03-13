import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
  ResourceAvatar,
} from "@app/components/resources/resources_icons";
import type {
  SkillRelations,
  SkillType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { cn, PuzzleIcon } from "@dust-tt/sparkle";
import type { AvatarSizeType } from "@dust-tt/sparkle/dist/esm/components/Avatar";
import React from "react";

export const SKILL_ICON = PuzzleIcon;

export const SKILL_AVATAR_BACKGROUND_COLOR =
  "bg-highlight-50 dark:bg-highlight-50-night";
export const SKILL_AVATAR_ICON_COLOR =
  "text-highlight dark:text-highlight-night";

export function getSkillAvatarIcon(
  iconString: string | null
): React.ComponentType<{
  className?: string;
  size?: AvatarSizeType;
  name?: string;
}> {
  if (
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
  ) {
    const icon = getIcon(iconString);
    return (props) =>
      React.createElement(ResourceAvatar, {
        icon,
        size: "sm",
        backgroundColor: SKILL_AVATAR_BACKGROUND_COLOR,
        iconColor: SKILL_AVATAR_ICON_COLOR,
        ...props,
      });
  }

  return (props) =>
    React.createElement(ResourceAvatar, {
      icon: SKILL_ICON,
      size: "sm",
      backgroundColor: SKILL_AVATAR_BACKGROUND_COLOR,
      iconColor: SKILL_AVATAR_ICON_COLOR,
      ...props,
    });
}

export function getSkillIcon(
  iconString: string | null
): React.ComponentType<{ className?: string }> {
  const Icon =
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
      ? getIcon(iconString)
      : SKILL_ICON;

  return ({ className }) =>
    React.createElement(Icon, {
      className: cn(SKILL_AVATAR_ICON_COLOR, className),
    });
}

export function hasRelations(
  skill: SkillType & { relations?: SkillRelations }
): skill is SkillWithRelationsType {
  return skill.relations !== undefined;
}
