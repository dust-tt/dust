import type { SuggestionDiffLayout } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillNameSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { LoadingBlock } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface SuggestedSkillNameProps {
  suggestion: SkillNameSuggestionType;
  skillId: string;
  workspaceId: string;
  layout?: SuggestionDiffLayout;
}

export function SuggestedSkillName({
  suggestion,
  skillId,
  workspaceId,
  layout = "boxed",
}: SuggestedSkillNameProps) {
  const { t } = useLingui();
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  return (
    <SuggestionFieldEditSection
      label={t`Name`}
      currentValue={skill?.name ?? ""}
      newValue={suggestion.name}
      layout={layout}
    />
  );
}
