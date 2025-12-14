import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";

const USER_FACING_DESCRIPTION_FIELD_NAME = "userFacingDescription";

export function SkillBuilderUserFacingDescriptionSection() {
  return (
    <BaseFormFieldSection
      fieldName={USER_FACING_DESCRIPTION_FIELD_NAME}
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
  );
}
