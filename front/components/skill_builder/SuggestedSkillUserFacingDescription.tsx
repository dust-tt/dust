import { SkillFieldEditSection } from "@app/components/skill_builder/SkillFieldEditSection";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillUserFacingDescriptionSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { LoadingBlock } from "@dust-tt/sparkle";

interface SuggestedSkillUserFacingDescriptionProps {
  suggestion: SkillUserFacingDescriptionSuggestionType;
  skillId: string;
  workspaceId: string;
}

export function SuggestedSkillUserFacingDescription({
  suggestion,
  skillId,
  workspaceId,
}: SuggestedSkillUserFacingDescriptionProps) {
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  return (
    <SkillFieldEditSection
      label="Description"
      currentValue={skill?.userFacingDescription ?? ""}
      newValue={suggestion.userFacingDescription}
    />
  );
}
