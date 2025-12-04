import { TextArea } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

// TODO(skills): see if we can reuse DescriptionSection more or less directly.

const DESCRIPTION_FIELD_NAME = "description";

export function SkillBuilderDescriptionSection() {
  return (
    <BaseFormFieldSection
      // TODO(skills): double check the copy.
      title="What will this skill be used for?"
      fieldName={DESCRIPTION_FIELD_NAME}
      triggerValidationOnChange={false}
    >
      {({ registerRef, registerProps, onChange, errorMessage }) => (
        <TextArea
          ref={registerRef}
          placeholder="When should this skill be used? What will this skill be good for?"
          className="min-h-24"
          onChange={onChange}
          error={errorMessage}
          showErrorLabel
          {...registerProps}
        />
      )}
    </BaseFormFieldSection>
  );
}
