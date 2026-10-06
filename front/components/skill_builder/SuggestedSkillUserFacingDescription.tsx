import type { SuggestionDiffLayout } from "@app/components/shared/SuggestionFieldEditSection";
import { SuggestionFieldEditSection } from "@app/components/shared/SuggestionFieldEditSection";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillUserFacingDescriptionSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { LoadingBlock } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface SuggestedSkillUserFacingDescriptionProps {
  suggestion: SkillUserFacingDescriptionSuggestionType;
  skillId: string;
  workspaceId: string;
  layout?: SuggestionDiffLayout;
}

export function SuggestedSkillUserFacingDescription({
  suggestion,
  skillId,
  workspaceId,
  layout = "boxed",
}: SuggestedSkillUserFacingDescriptionProps) {
  const { t } = useLingui();
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  return (
    <SuggestionFieldEditSection
      label={t`Description`}
      currentValue={skill?.userFacingDescription ?? ""}
      newValue={suggestion.userFacingDescription}
      layout={layout}
    />
  );
}
