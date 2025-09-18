import { TextArea } from "@dust-tt/sparkle";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

interface DescriptionSectionProps {
  title: string;
  description: string;
  label?: string;
  placeholder: string;
  maxLength?: number;
  triggerValidationOnChange?: boolean;
}

const DESCRIPTION_FIELD_NAME = "description";

export function DescriptionSection({
  title,
  description,
  label,
  placeholder,
  maxLength,
  triggerValidationOnChange = false,
}: DescriptionSectionProps) {
  return (
    <BaseFormFieldSection
      title={title}
      description={description}
      fieldName={DESCRIPTION_FIELD_NAME}
      triggerValidationOnChange={triggerValidationOnChange}
    >
      {({ registerRef, registerProps, onChange, errorMessage }) => (
        <>
          {label && <label className="text-sm font-medium">{label}</label>}
          <TextArea
            ref={registerRef}
            placeholder={placeholder}
            rows={4}
            maxLength={maxLength}
            showErrorLabel
            error={errorMessage}
            onChange={onChange}
            {...registerProps}
          />
        </>
      )}
    </BaseFormFieldSection>
  );
}
