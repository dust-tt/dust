import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { SkillEditorsSheet } from "@app/components/skill_builder/SkillEditorsSheet";

export function SkillBuilderSettingsSection() {
  return (
    <>
      <BaseFormFieldSection
        title="Skill settings"
        fieldName="name"
        description="Specialized tools that agents can use to accomplish their tasks."
        triggerValidationOnChange={false}
      >
        {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
          <Input
            ref={registerRef}
            label="Skill name"
            placeholder="Enter skill name"
            onChange={onChange}
            message={errorMessage}
            messageStatus={hasError ? "error" : "default"}
            {...registerProps}
          />
        )}
      </BaseFormFieldSection>
      <div className="flex flex-col gap-2">
        <h3 className="heading-base font-semibold text-foreground dark:text-foreground-night">
          Editors
        </h3>
        <div>
          <SkillEditorsSheet />
        </div>
      </div>
    </>
  );
}
