import { TextArea } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

// TODO(skills): see if we can reuse DescriptionSection more or less directly.

export function SkillBuilderDescriptionSection() {
  return (
    <section className="flex flex-col gap-3">
      {/* TODO(skills): double check the copy. */}
      <h2 className="heading-lg text-foreground dark:text-foreground-night">
        What will this skill be used for?
      </h2>
      <BaseFormFieldSection<HTMLTextAreaElement> fieldName="description">
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
    </section>
  );
}
