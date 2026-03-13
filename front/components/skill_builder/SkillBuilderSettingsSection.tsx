import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderIsDefaultSection } from "@app/components/skill_builder/SkillBuilderIsDefaultSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillEditorsSheet } from "@app/components/skill_builder/SkillEditorsSheet";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
} from "@dust-tt/sparkle";

export function SkillBuilderSettingsSection() {
  const { hasFeature } = useFeatureFlags();

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
      <div className="flex flex-col space-y-3">
        <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
          Editors
        </Label>
        <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-2">
          <SkillEditorsSheet />
        </div>
      </div>
      {hasFeature("discover_skills") && (
        <Collapsible>
          <CollapsibleTrigger label="Advanced" variant="secondary" />
          <CollapsibleContent>
            <div className="pt-3">
              <SkillBuilderIsDefaultSection />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
