import { TextArea } from "@dust-tt/sparkle";

interface DescriptionSectionProps {
  title: string;
  description: string;
  label?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  helpText?: string;
  maxLength?: number;
}

export function DescriptionSection({
  title,
  description,
  label,
  placeholder,
  value,
  onChange,
  helpText,
  maxLength,
}: DescriptionSectionProps) {
  const validationError =
    maxLength && value.length > maxLength
      ? `The description must be less than ${maxLength} characters.`
      : undefined;
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
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          error={validationError}
          showErrorLabel={true}
        />
        {helpText && (
          <p className="text-xs text-muted-foreground">{helpText}</p>
        )}
      </div>
    </div>
  );
}
