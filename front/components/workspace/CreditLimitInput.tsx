import { Chip, Input, Page } from "@dust-tt/sparkle";

interface CreditLimitNumberInputProps {
  value: string;
  readOnly: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  suffix?: string;
}

export function CreditLimitNumberInput({
  value,
  readOnly,
  validationMessage,
  onChange,
  suffix = "credits/month",
}: CreditLimitNumberInputProps) {
  return (
    <Input
      size="sm"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder="--"
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
}

export function CreditLimitInput({
  label,
  value,
  readOnly,
  isHighest,
  validationMessage,
  onChange,
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
      />
    </Page.Vertical>
  );
}
