import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";

const NAME_FIELD_NAME = "name";

export function SkillBuilderNameSection() {
  return (
    <div className="flex items-end gap-4">
      <div className="flex-grow">
        <BaseFormFieldSection
          title="Name"
          fieldName={NAME_FIELD_NAME}
          triggerValidationOnChange={false}
        >
          {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
            <Input
              ref={registerRef}
              placeholder="Enter skill name"
              onChange={onChange}
              message={errorMessage}
              messageStatus={hasError ? "error" : "default"}
              {...registerProps}
            />
          )}
        </BaseFormFieldSection>
      </div>
      <SkillBuilderIconSection />
    </div>
  );
}
