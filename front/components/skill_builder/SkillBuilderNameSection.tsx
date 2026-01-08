import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";

const NAME_FIELD_NAME = "name";

export function SkillBuilderNameSection() {
  return (
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
  );
}
