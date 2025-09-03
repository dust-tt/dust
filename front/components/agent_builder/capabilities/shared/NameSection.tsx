import { Input } from "@dust-tt/sparkle";
import { forwardRef } from "react";
import { useController, useFormContext } from "react-hook-form";

import type { CapabilityFormData } from "@app/components/agent_builder/types";

interface NameSectionProps {
  title: string;
  description?: string;
  label?: string;
  placeholder: string;
  helpText?: string;
}

const FIELD_NAME = "name";

export const NameSection = forwardRef<HTMLInputElement, NameSectionProps>(
  ({ title, description, label, placeholder, helpText }, ref) => {
    const { register } = useFormContext();
    const { fieldState } = useController<CapabilityFormData, typeof FIELD_NAME>(
      {
        name: FIELD_NAME,
      }
    );

    const { ref: registerRef, ...registerProps } = register(FIELD_NAME);

    return (
      <div className="space-y-4">
        <div>
          <h3 className="mb-2 text-lg font-semibold">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              {description}
            </p>
          )}
        </div>

        <div className="space-y-2">
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
            {...registerProps}
            label={label}
            message={fieldState.error?.message}
            messageStatus={fieldState.error ? "error" : "default"}
          />
          {helpText && (
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              {helpText}
            </p>
          )}
        </div>
      </div>
    );
  }
);

NameSection.displayName = "NameSection";
