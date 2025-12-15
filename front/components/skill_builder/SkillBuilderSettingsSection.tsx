import { Label } from "@dust-tt/sparkle";

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
      <div className="flex flex-col space-y-3">
        <Label className="text-sm font-semibold text-foreground dark:text-foreground-night">
          Editors
        </Label>
        <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-2">
          <SkillEditorsSheet />
        </div>
      </div>
    </div>
  );
}
