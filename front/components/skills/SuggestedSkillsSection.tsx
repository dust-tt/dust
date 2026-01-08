import {
  Avatar,
  Button,
  Card,
  CardActionButton,
  CardGrid,
  PlusIcon,
  SparklesIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";

import { getSkillIcon } from "@app/lib/skill";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

type SuggestedSkillCardProps = {
  skill: SkillWithRelationsType;
  onMoreInfoClick: () => void;
};

function SuggestedSkillCard({
  skill,
  onMoreInfoClick,
}: SuggestedSkillCardProps) {
  return (
    <Card
      variant="primary"
      onClick={onMoreInfoClick}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={
            (e) => e.stopPropagation() // TODO(skills) remove the skill suggestion
          }
        />
      }
    >
      <div className="flex h-full w-full flex-col justify-between gap-3">
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <Avatar icon={getSkillIcon(skill.icon)} size="sm" />
            <span className="text-sm font-medium">{skill.name}</span>
          </div>
          <p className="line-clamp-2 text-sm text-muted-foreground dark:text-muted-foreground-night">
            {skill.userFacingDescription}
          </p>
        </div>
        <div>
          <Button
            size="xs"
            variant="outline"
            icon={PlusIcon}
            label="Add skill" // TODO(skills): decide if this is the right label
            onClick={(e) => {
              // TODO(skills): open the editor to customize the skill before adding
              e.stopPropagation();
            }}
          />
        </div>
      </div>
    </Card>
  );
}

type SuggestedSkillsSectionProps = {
  skills: SkillWithRelationsType[];
  onSkillClick: (skill: SkillWithRelationsType) => void;
};

export function SuggestedSkillsSection({
  skills,
  onSkillClick,
}: SuggestedSkillsSectionProps) {
  if (skills.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 flex flex-col gap-3 pb-6">
      <h4 className="heading-sm flex items-center gap-1.5 text-foreground dark:text-foreground-night">
        Suggested skills
        <SparklesIcon className="h-4 w-4" />
      </h4>
      <CardGrid>
        {skills.map((skill) => (
          <SuggestedSkillCard
            key={skill.sId}
            skill={skill}
            onMoreInfoClick={() => onSkillClick(skill)}
          />
        ))}
      </CardGrid>
    </div>
  );
}
