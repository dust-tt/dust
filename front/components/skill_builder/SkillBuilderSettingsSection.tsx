import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

export function SkillBuilderSettingsSection() {
  return (
    <BaseFormFieldSection
      title="Skill settings"
      fieldName="name"
      description="Specialized tools that agents can use to accomplish their tasks."
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
  );
}
