import { Chip, Input, Page } from "@dust-tt/sparkle";

interface CreditLimitNumberInputProps {
  value: string;
  readOnly: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  suffix?: string;
  placeholder?: string;
}

export function CreditLimitNumberInput({
  value,
  readOnly,
  validationMessage,
  onChange,
  suffix = "credits/month",
  placeholder = "0",
}: CreditLimitNumberInputProps) {
  return (
    <Input
      size="sm"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder}
      disabled={readOnly}
      value={value !== "" ? Number(value).toLocaleString() : ""}
      onChange={(e) => {
        onChange(e.target.value.replace(/[^\d]/g, ""));
      }}
      isError={validationMessage !== null}
      message={validationMessage ?? undefined}
      messageStatus={validationMessage !== null ? "error" : undefined}
      suffix={suffix}
      isUnit
    />
  );
}

interface CreditLimitInputProps {
  label: string;
  value: string;
  readOnly: boolean;
  isHighest: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  placeholder?: string;
}

export function CreditLimitInput({
  label,
  value,
  readOnly,
  isHighest,
  validationMessage,
  onChange,
  placeholder,
}: CreditLimitInputProps) {
  return (
    <Page.Vertical gap="xs" align="stretch">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {isHighest && <Chip size="mini" color="highlight" label="Highest" />}
      </div>
      <CreditLimitNumberInput
        value={value}
        readOnly={readOnly}
        validationMessage={validationMessage}
        onChange={onChange}
        placeholder={placeholder}
      />
    </Page.Vertical>
  );
}
