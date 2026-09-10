import { Button, Chip, Input, Page, Tooltip } from "@dust-tt/sparkle";

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
  // Shown on hover when the field is read-only, to say why it is locked.
  readOnlyTooltip?: string;
  isActive: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  // Small text action rendered on the opposite end of the label row (e.g. to
  // clear the field). Omit when the field has nothing to clear back to.
  action?: { label: string; onClick: () => void };
}

export function CreditLimitInput({
  label,
  value,
  readOnly,
  readOnlyTooltip,
  isActive,
  validationMessage,
  onChange,
  action,
}: CreditLimitInputProps) {
  const input = (
    <CreditLimitNumberInput
      value={value}
      readOnly={readOnly}
      validationMessage={validationMessage}
      onChange={onChange}
    />
  );
  return (
    <Page.Vertical gap="xs" align="stretch">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {isActive && <Chip size="mini" color="highlight" label="Active" />}
        {!readOnly && action && (
          <Button
            variant="ghost"
            size="xs"
            label={action.label}
            onClick={action.onClick}
            className="ml-auto"
          />
        )}
      </div>
      {readOnly && readOnlyTooltip ? (
        <Tooltip
          tooltipTriggerAsChild
          label={readOnlyTooltip}
          // Disabled inputs swallow hover events, so the trigger is a wrapper.
          trigger={<div>{input}</div>}
        />
      ) : (
        input
      )}
    </Page.Vertical>
  );
}
