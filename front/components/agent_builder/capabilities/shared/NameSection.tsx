import { Input } from "@dust-tt/sparkle";
import { forwardRef, useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { BaseFormFieldSection } from "@app/components/agent_builder/capabilities/shared/BaseFormFieldSection";

interface NameSectionProps {
  title?: string;
  description?: string;
  label?: string;
  placeholder: string;
  helpText?: string;
  triggerValidationOnChange?: boolean;
}

export const NAME_FIELD_NAME = "name";

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
    const nameValue = useWatch({ name: NAME_FIELD_NAME });
    const { trigger } = useFormContext();

    useEffect(() => {
      void trigger(NAME_FIELD_NAME); // empty name will trigger error message
    }, [nameValue, trigger]);

    return (
      <BaseFormFieldSection
        title={title}
        description={description}
        helpText={helpText}
        fieldName={NAME_FIELD_NAME}
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
