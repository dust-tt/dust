import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
  ResourceAvatar,
  ResourceAvatarWithBadge,
} from "@app/components/resources/resources_icons";
import type {
  SkillRelations,
  SkillType,
  SkillWithoutInstructionsAndToolsType,
  SkillWithRelationsType,
} from "@app/types/assistant/skill_configuration";
import { cn, DustLogoSquare, PuzzlePiece01 } from "@dust-tt/sparkle";
import type { AvatarSizeType } from "@dust-tt/sparkle/dist/esm/components/Avatar";
import React from "react";

export const SKILL_ICON = PuzzlePiece01;
export const DUST_PROVIDED_SKILL_LABEL = "Dust-provided skill";

export const SKILL_AVATAR_BACKGROUND_COLOR =
  "bg-highlight-50 dark:bg-highlight-50-night";
export const SKILL_AVATAR_ICON_COLOR =
  "text-highlight dark:text-highlight-night";

interface SkillAvatarIconProps {
  className?: string;
  size?: AvatarSizeType;
  name?: string;
}

type SkillAvatarIconInput =
  | string
  | null
  | Pick<SkillWithoutInstructionsAndToolsType, "editedBy" | "icon">;

export function isDustProvidedSkill(
  skill: Pick<SkillWithoutInstructionsAndToolsType, "editedBy">
) {
  return skill.editedBy === null;
}

function isSkillAvatarIconSkill(
  input: SkillAvatarIconInput
): input is Pick<SkillWithoutInstructionsAndToolsType, "editedBy" | "icon"> {
  return input !== null && typeof input === "object";
}

export function getSkillAvatarIcon(
  input: SkillAvatarIconInput
): React.ComponentType<SkillAvatarIconProps> {
  let iconString: string | null;
  let isDustProvided = false;

  if (isSkillAvatarIconSkill(input)) {
    iconString = input.icon;
    isDustProvided = isDustProvidedSkill(input);
  } else {
    iconString = input;
  }

  let SkillAvatar: React.ComponentType<SkillAvatarIconProps>;
  let skillIcon: React.ComponentType<{ className?: string }> = SKILL_ICON;

  if (
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
  ) {
    const icon = getIcon(iconString);
    skillIcon = icon;
    SkillAvatar = (props) =>
      React.createElement(ResourceAvatar, {
        icon,
        size: "sm",
        backgroundColor: SKILL_AVATAR_BACKGROUND_COLOR,
        iconColor: SKILL_AVATAR_ICON_COLOR,
        ...props,
      });
  } else {
    SkillAvatar = (props) =>
      React.createElement(ResourceAvatar, {
        icon: SKILL_ICON,
        size: "sm",
        backgroundColor: SKILL_AVATAR_BACKGROUND_COLOR,
        iconColor: SKILL_AVATAR_ICON_COLOR,
        ...props,
      });
  }

  if (!isDustProvided) {
    return SkillAvatar;
  }

  return ({ className, size, ...props }) => {
    const avatarSize = size ?? "sm";
    const badgeSize = size ?? (className ? "xxs" : "sm");

    return React.createElement(ResourceAvatarWithBadge, {
      badgeIcon: DustLogoSquare,
      badgeSize,
      className,
      icon: skillIcon,
      size: avatarSize,
      backgroundColor: SKILL_AVATAR_BACKGROUND_COLOR,
      iconColor: SKILL_AVATAR_ICON_COLOR,
      ...props,
    });
  };
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
