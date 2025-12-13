import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
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
          <div className="space-y-3">
            <div className="flex space-x-2">
              <div className="flex-grow">
                <Input
                  ref={registerRef}
                  label="Skill name"
                  placeholder="Enter skill name"
                  onChange={onChange}
                  message={errorMessage}
                  messageStatus={hasError ? "error" : "default"}
                  {...registerProps}
                />
              </div>
              <div className="flex flex-col gap-2">
                <SkillBuilderIconSection />
              </div>
            </div>
          </div>
        )}
      </BaseFormFieldSection>
      <BaseFormFieldSection
        fieldName="userFacingDescription"
        triggerValidationOnChange={false}
      >
        {({ registerRef, registerProps, onChange }) => (
          <Input
            ref={registerRef}
            label="Description"
            placeholder="Enter skill description"
            onChange={onChange}
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
