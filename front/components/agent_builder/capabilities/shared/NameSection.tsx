import { Input } from "@dust-tt/sparkle";
import { forwardRef } from "react";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

interface NameSectionProps {
  title?: string;
  description?: string;
  label?: string;
  placeholder: string;
  helpText?: string;
  triggerValidationOnChange?: boolean;
}

const DEFAULT_FIELD_NAME = "name";

export const NameSection = forwardRef<HTMLInputElement, NameSectionProps>(
  (
    {
      title,
      description,
      label,
      placeholder,
      helpText,
      triggerValidationOnChange = false,
    },
    ref
  ) => {
    return (
      <BaseFormFieldSection<HTMLInputElement>
        title={title}
        description={description}
        helpText={helpText}
        fieldName={DEFAULT_FIELD_NAME}
        triggerValidationOnChange={triggerValidationOnChange}
      >
        {({ registerRef, registerProps, onChange, errorMessage, hasError }) => {
          return (
            <Input
              ref={(e) => {
                registerRef(e);
                if (ref) {
                  if (typeof ref === "function") {
                    ref(e);
                  } else {
                    ref.current = e;
                  }
                }
              }}
              placeholder={placeholder}
              label={label}
              onChange={onChange}
              message={errorMessage}
              messageStatus={hasError ? "error" : "default"}
              {...registerProps}
            />
          );
        }}
      </BaseFormFieldSection>
    );
  }
);

NameSection.displayName = "NameSection";
