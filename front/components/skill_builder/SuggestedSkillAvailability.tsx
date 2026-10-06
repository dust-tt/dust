import { SuggestedChangeRow } from "@app/components/shared/SuggestedChangeRow";
import { SKILL_AVAILABILITY_DISPLAY } from "@app/components/skills/skillAvailabilityDisplay";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillAvailabilitySuggestionType } from "@app/types/suggestions/skill_suggestion";
import { LoadingBlock } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  const current = skill ? SKILL_AVAILABILITY_DISPLAY[skill.availability] : null;
  const next = SKILL_AVAILABILITY_DISPLAY[suggestion.availability];

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">
        <Trans>Availability</Trans>
      </span>
      <div className="divide-y divide-border">
        {current && (
          <SuggestedChangeRow
            action="remove"
            title={t(current.label)}
            description={t(current.tooltip)}
          />
        )}
        <SuggestedChangeRow
          action="add"
          title={t(next.label)}
          description={t(next.tooltip)}
        />
      </div>
    </div>
  );
}
