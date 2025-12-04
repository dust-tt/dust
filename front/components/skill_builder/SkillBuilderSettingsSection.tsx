import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

export function SkillBuilderSettingsSection() {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="heading-lg text-foreground dark:text-foreground-night">
          Skill settings
        </h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Specialized tools that agents can use to accomplish their tasks.
        </p>
      </div>
      <BaseFormFieldSection<HTMLInputElement> fieldName="name">
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
    </section>
  );
}
