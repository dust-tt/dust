import { Input } from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

import type { CapabilityFormData } from "@app/components/agent_builder/types";

interface NameSectionProps {
  title: string;
  description: string;
  label?: string;
  placeholder: string;
  helpText?: string;
}

const FIELD_NAME = "name";

export function NameSection({
  title,
  description,
  label,
  placeholder,
  helpText,
}: NameSectionProps) {
  const { register } = useFormContext();
  const { fieldState } = useController<CapabilityFormData, typeof FIELD_NAME>({
    name: FIELD_NAME,
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          {description}
        </p>
      </div>

      <div className="space-y-2">
        <Input
          placeholder={placeholder}
          {...register(FIELD_NAME)}
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
