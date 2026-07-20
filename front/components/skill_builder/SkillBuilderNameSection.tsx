import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { Input } from "@dust-tt/sparkle";
import { useFormState } from "react-hook-form";

const NAME_FIELD_NAME = "name";

export function SkillBuilderNameSection() {
  const { disabled: isReadOnly } = useFormState<SkillBuilderFormData>();

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
          disabled={isReadOnly}
          {...registerProps}
        />
      )}
    </BaseFormFieldSection>
  );
}
