import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
  ResourceAvatar,
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

type SkillAvatarIconProps = {
  className?: string;
  size?: AvatarSizeType;
  name?: string;
};

type SkillAvatarIconOptions = {
  isDustProvided?: boolean;
};

export function isDustProvidedSkill(
  skill: Pick<SkillWithoutInstructionsAndToolsType, "editedBy">
) {
  return skill.editedBy === null;
}

export function getSkillAvatarIcon(
  iconString: string | null,
  { isDustProvided = false }: SkillAvatarIconOptions = {}
): React.ComponentType<SkillAvatarIconProps> {
  let SkillAvatar: React.ComponentType<SkillAvatarIconProps>;

  if (
    iconString &&
    (isCustomResourceIconType(iconString) || isInternalAllowedIcon(iconString))
  ) {
    const icon = getIcon(iconString);
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

  return ({ className, size, ...props }) =>
    React.createElement(
      "div",
      {
        className: cn("relative inline-flex overflow-visible", className),
      },
      React.createElement(SkillAvatar, { size: size ?? "xxs", ...props }),
      React.createElement(
        "span",
        {
          className: cn(
            "pointer-events-none absolute bottom-0 right-0",
            "flex h-2 w-2 items-center justify-center rounded-[2px]",
            "bg-background shadow-sm ring-1 ring-border",
            "dark:bg-background-night dark:ring-border-night"
          ),
        },
        React.createElement(DustLogoSquare, {
          className: "h-1.5 w-1.5",
        })
      )
    );
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
