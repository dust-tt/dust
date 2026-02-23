import {
  getSkillIcon,
  SKILL_AVATAR_BACKGROUND_COLOR,
  SKILL_AVATAR_ICON_COLOR,
} from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { ActionCard } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";

interface SkillCardProps {
  skill: SkillType;
  isSelected: boolean;
  onClick: () => void;
  onMoreInfoClick: () => void;
}

export function SkillCard({
  skill,
  isSelected,
  onClick,
  onMoreInfoClick,
}: SkillCardProps) {
  return (
    <ActionCard
      icon={getSkillIcon(skill.icon)}
      iconBackgroundColor={SKILL_AVATAR_BACKGROUND_COLOR}
      iconColor={SKILL_AVATAR_ICON_COLOR}
      label={skill.name}
      description={skill.userFacingDescription}
      isSelected={isSelected}
      canAdd={!isSelected}
      onClick={onClick}
      cardContainerClassName="h-36"
      mountPortal
      footer={{
        label: "Skill details",
        onClick: onMoreInfoClick,
      }}
    />
  );
}
