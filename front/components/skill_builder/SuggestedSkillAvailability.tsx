import { SKILL_AVAILABILITY_DISPLAY } from "@app/lib/skills/labels";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import type { SkillAvailabilitySuggestionType } from "@app/types/suggestions/skill_suggestion";
import { Chip, LoadingBlock, Tooltip } from "@dust-tt/sparkle";

interface AvailabilityChipProps {
  availability: SkillAvailability;
}

function AvailabilityChip({ availability }: AvailabilityChipProps) {
  const display = SKILL_AVAILABILITY_DISPLAY[availability];

  return (
    <Tooltip
      label={display.tooltip}
      trigger={<Chip size="xs" color={display.color} label={display.label} />}
    />
  );
}

interface SuggestedSkillAvailabilityProps {
  suggestion: SkillAvailabilitySuggestionType;
  skillId: string;
  workspaceId: string;
}

export function SuggestedSkillAvailability({
  suggestion,
  skillId,
  workspaceId,
}: SuggestedSkillAvailabilityProps) {
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">Availability</span>
      <div className="flex items-center gap-2 rounded-xl border border-separator bg-background px-3 py-2.5">
        {skill && (
          <>
            <AvailabilityChip availability={skill.availability} />
            <span className="text-xs text-muted-foreground">becomes</span>
          </>
        )}
        <AvailabilityChip availability={suggestion.availability} />
      </div>
    </div>
  );
}
