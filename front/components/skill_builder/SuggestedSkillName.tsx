import { SkillFieldEditSection } from "@app/components/skill_builder/SkillFieldEditSection";
import { useSkill } from "@app/lib/swr/skill_configurations";
import type { SkillNameSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { LoadingBlock } from "@dust-tt/sparkle";

interface SuggestedSkillNameProps {
  suggestion: SkillNameSuggestionType;
  skillId: string;
  workspaceId: string;
}

export function SuggestedSkillName({
  suggestion,
  skillId,
  workspaceId,
}: SuggestedSkillNameProps) {
  const { skill, isSkillLoading } = useSkill({ workspaceId, skillId });

  if (isSkillLoading) {
    return <LoadingBlock className="h-16 w-full" />;
  }

  return (
    <SkillFieldEditSection
      label="Name"
      currentValue={skill?.name ?? ""}
      newValue={suggestion.name}
    />
  );
}
