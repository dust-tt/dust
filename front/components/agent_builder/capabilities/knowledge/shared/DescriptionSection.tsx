import { TextArea } from "@dust-tt/sparkle";
import { useController, useFormContext } from "react-hook-form";

import type { CapabilityFormData } from "@app/components/agent_builder/types";

interface DescriptionSectionProps {
  title: string;
  description: string;
  label?: string;
  placeholder: string;
  helpText?: string;
  maxLength?: number;
}

const FIELD_NAME = "description";

export function DescriptionSection({
  title,
  description,
  label,
  placeholder,
  helpText,
}: DescriptionSectionProps) {
  const { register } = useFormContext();
  const { fieldState } = useController<CapabilityFormData, typeof FIELD_NAME>({
    name: FIELD_NAME,
  });

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 text-lg font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="space-y-2">
        {label && <label className="text-sm font-medium">{label}</label>}
        <TextArea
          placeholder={placeholder}
          {...register(FIELD_NAME)}
          rows={4}
          showErrorLabel={true}
          error={fieldState.error?.message}
        />
        {helpText && (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        )}
      </div>
    </div>
  );
}
