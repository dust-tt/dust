import { TextArea } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";

const INSTRUCTIONS_FIELD_NAME = "instructions";

export function SkillBuilderInstructionsSection() {
  return (
    <BaseFormFieldSection
      title="How should this skill behave?"
      triggerValidationOnChange={false}
      fieldName={INSTRUCTIONS_FIELD_NAME}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <TextArea
          ref={registerRef}
          placeholder="What does this skill do? How should it behave?"
          className="min-h-40"
          onChange={onChange}
          error={hasError ? errorMessage : undefined}
          showErrorLabel={hasError}
          {...registerProps}
        />
      )}
    </BaseFormFieldSection>
  );
}
