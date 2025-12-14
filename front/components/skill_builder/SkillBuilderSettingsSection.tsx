import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillEditorsSheet } from "@app/components/skill_builder/SkillEditorsSheet";

export function SkillBuilderSettingsSection() {
  return (
    <div className="space-y-5">
      <h2 className="heading-lg text-foreground dark:text-foreground-night">
        Skill settings
      </h2>
      <SkillBuilderNameSection />
      <SkillBuilderUserFacingDescriptionSection />
      <div className="space-y-3">
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          Editors
        </h3>
        <SkillEditorsSheet />
      </div>
    </div>
  );
}
