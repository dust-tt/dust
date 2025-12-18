import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";

const NAME_FIELD_NAME = "name";

export function SkillBuilderNameSection() {
  return (
    <BaseFormFieldSection
      title="Name"
      fieldName={NAME_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <div className="flex space-x-2">
          <div className="flex-grow">
            <Input
              ref={registerRef}
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
      )}
    </BaseFormFieldSection>
  );
}
