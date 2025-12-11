import { ActionCard } from "@dust-tt/sparkle";
import React from "react";

import { SKILL_ICON } from "@app/lib/skill";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

interface SkillCardProps {
  skill: SkillConfigurationType;
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
      icon={SKILL_ICON}
      label={skill.name}
      description={skill.description}
      isSelected={isSelected}
      canAdd={true}
      onClick={onClick}
      cardContainerClassName="h-36"
      mountPortal
      footer={{
        label: "More info",
        onClick: onMoreInfoClick,
      }}
    />
  );
}
