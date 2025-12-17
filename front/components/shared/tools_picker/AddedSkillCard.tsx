import { Card, CardActionButton, XMarkIcon } from "@dust-tt/sparkle";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SKILL_ICON } from "@app/lib/skill";

export interface AddedSkillCardProps {
  skill: AgentBuilderSkillsType;
  onRemove: () => void;
  onClick?: () => void;
}

export function AddedSkillCard({
  skill,
  onRemove,
  onClick,
}: AddedSkillCardProps) {
  const SkillIcon = SKILL_ICON;

  return (
    <Card
      variant="primary"
      className="h-28"
      onClick={onClick}
      action={
        <CardActionButton
          size="mini"
          icon={XMarkIcon}
          onClick={(e: Event) => {
            onRemove();
            e.stopPropagation();
          }}
        />
      }
    >
      <div className="flex w-full flex-col gap-2 text-sm">
        <div className="flex w-full items-center gap-2 font-medium text-foreground dark:text-foreground-night">
          <SkillIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{skill.name}</span>
        </div>

        <div className="text-muted-foreground dark:text-muted-foreground-night">
          <span className="line-clamp-2 break-words">{skill.description}</span>
        </div>
      </div>
    </Card>
  );
}
