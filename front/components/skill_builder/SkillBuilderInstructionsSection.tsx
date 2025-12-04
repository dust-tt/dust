import { TextArea } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

export function SkillBuilderInstructionsSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="heading-lg text-foreground dark:text-foreground-night">
        How should this skill behave?
      </h2>
      <BaseFormFieldSection<HTMLTextAreaElement> fieldName="instructions">
        {({ registerRef, registerProps, onChange, errorMessage }) => (
          <TextArea
            ref={registerRef}
            placeholder="What does this skill do? How should it behave?"
            className="min-h-40"
            onChange={onChange}
            error={errorMessage}
            showErrorLabel
            {...registerProps}
          />
        )}
      </BaseFormFieldSection>
    </section>
  );
}
