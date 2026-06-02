import { SkillBuilderEnableSuggestionsSection } from "@app/components/skill_builder/SkillBuilderEnableSuggestionsSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillBuilderVisibilitySection } from "@app/components/skill_builder/SkillBuilderVisibilitySection";
import { SkillEditorsSheet } from "@app/components/skill_builder/SkillEditorsSheet";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { Chip, Label } from "@dust-tt/sparkle";

interface SkillBuilderSettingsSectionProps {
  skill?: SkillType;
  hasSelfImprovingSkills: boolean;
}

export function SkillBuilderSettingsSection({
  skill,
  hasSelfImprovingSkills,
}: SkillBuilderSettingsSectionProps) {
  return (
    <div className="space-y-5">
      <h2 className="heading-lg text-foreground dark:text-foreground-night">
        Skill settings
      </h2>
      <div className="flex items-end gap-8">
        <div className="flex-grow">
          <SkillBuilderNameSection />
        </div>
        <SkillBuilderIconSection />
      </div>
      <SkillBuilderUserFacingDescriptionSection />
      <SkillBuilderVisibilitySection />
      <div className="flex flex-col space-y-3">
        <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
          Editors
        </Label>
        <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-2">
          <SkillEditorsSheet />
        </div>
      </div>
      {hasSelfImprovingSkills && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
              Self Improvement
            </Label>
            <Chip size="xs" color="golden" label="Beta" />
          </div>
          <SkillBuilderEnableSuggestionsSection
            selfImprovementLock={skill?.selfImprovementLock ?? false}
          />
        </div>
      )}
    </div>
  );
}
