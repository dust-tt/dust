import { TextArea } from "@dust-tt/sparkle";
import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

interface DescriptionSectionProps {
  title: string;
  description: string;
  label?: string;
  placeholder: string;
  maxLength?: number;
  fieldName?: string; // defaults to "description"
  triggerValidationOnChange?: boolean;
}

const DEFAULT_FIELD_NAME = "description" as const;

export function DescriptionSection({
  title,
  description,
  label,
  placeholder,
  maxLength,
  fieldName = DEFAULT_FIELD_NAME,
  triggerValidationOnChange = false,
}: DescriptionSectionProps) {
  return (
    <BaseFormFieldSection<HTMLTextAreaElement>
      title={title}
      description={description}
      fieldName={fieldName}
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
            showErrorLabel={true}
            error={errorMessage}
            onChange={onChange}
            {...registerProps}
          />
        </>
      )}
    </BaseFormFieldSection>
  );
}
