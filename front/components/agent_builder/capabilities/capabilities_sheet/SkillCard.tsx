import { ActionCard } from "@dust-tt/sparkle";
import React from "react";

import { getSkillIcon } from "@app/lib/skill";
import type { SkillType } from "@app/types/assistant/skill_configuration";

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
