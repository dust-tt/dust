import { SkillBuilderEnableSuggestionsSection } from "@app/components/skill_builder/SkillBuilderEnableSuggestionsSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderIsDefaultSection } from "@app/components/skill_builder/SkillBuilderIsDefaultSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillEditorsSheet } from "@app/components/skill_builder/SkillEditorsSheet";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import {
  Chip,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Label,
} from "@dust-tt/sparkle";

interface SkillBuilderSettingsSectionProps {
  skill?: SkillType;
  hasSelfImprovingSkills: boolean;
  disabled?: boolean;
}

export function SkillBuilderSettingsSection({
  skill,
  hasSelfImprovingSkills,
  disabled = false,
}: SkillBuilderSettingsSectionProps) {
  const { hasFeature } = useFeatureFlags();
  const isBetaTester = hasFeature("self_improvement_beta_tester");

  return (
    <div className="space-y-5">
      <h2 className="heading-lg text-foreground dark:text-foreground-night">
        Skill settings
      </h2>
      <div className="flex items-end gap-8">
        <div className="flex-grow">
          <SkillBuilderNameSection disabled={disabled} />
        </div>
        <SkillBuilderIconSection disabled={disabled} />
      </div>
      <SkillBuilderUserFacingDescriptionSection disabled={disabled} />
      <div className="flex flex-col space-y-3">
        <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
          Editors
        </Label>
        <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-2">
          <SkillEditorsSheet disabled={disabled} />
        </div>
      </div>
      {hasSelfImprovingSkills && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-base font-semibold text-foreground dark:text-foreground-night">
              Self Improvement
            </Label>
            {isBetaTester && <Chip size="xs" color="golden" label="Beta" />}
          </div>
          <SkillBuilderEnableSuggestionsSection
            disabled={disabled}
            selfImprovementLock={skill?.selfImprovementLock ?? false}
          />
        </div>
      )}
      {skill && (
        <>
          <Collapsible defaultOpen>
            <CollapsibleTrigger variant="secondary">
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 pt-3">
                <SkillBuilderIsDefaultSection disabled={disabled} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}
