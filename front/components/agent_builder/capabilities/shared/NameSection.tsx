import { Input } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/shared/BaseFormFieldSection";

interface NameSectionProps {
  title?: string;
  description?: string;
  label?: string;
  placeholder: string;
  helpText?: string;
  triggerValidationOnChange?: boolean;
}

export const NAME_FIELD_NAME = "name";

export function NameSection({
  title,
  description,
  label,
  placeholder,
  helpText,
  triggerValidationOnChange = false,
}: NameSectionProps) {
  return (
    <BaseFormFieldSection
      title={title}
      description={description}
      helpText={helpText}
      fieldName={NAME_FIELD_NAME}
      triggerValidationOnChange={triggerValidationOnChange}
    >
      {({ registerRef, registerProps, onChange, errorMessage, hasError }) => (
        <Input
          ref={registerRef}
          placeholder={placeholder}
          label={label}
          onChange={onChange}
          message={errorMessage}
          messageStatus={hasError ? "error" : "default"}
          {...registerProps}
        />
      )}
    </BaseFormFieldSection>
  );
}
