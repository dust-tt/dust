import { formatNumber } from "@app/lib/i18n/format";
import { Button, Input, Page, Tooltip } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface CreditLimitNumberInputProps {
  value: string;
  readOnly: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  suffix?: string;
  description?: string;
  placeholder?: string;
}

export function CreditLimitNumberInput({
  value,
  readOnly,
  validationMessage,
  onChange,
  suffix,
  description,
  placeholder,
}: CreditLimitNumberInputProps) {
  const { t } = useLingui();
  return (
    <Input
      size="sm"
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      placeholder={placeholder ?? "--"}
      disabled={readOnly}
      value={value !== "" ? formatNumber(Number(value)) : ""}
      onChange={(e) => {
        onChange(e.target.value.replace(/[^\d]/g, ""));
      }}
      isError={validationMessage !== null}
      message={validationMessage ?? description}
      messageStatus={validationMessage !== null ? "error" : undefined}
      suffix={suffix ?? t`credits/month`}
      isUnit
      className={
        readOnly
          ? undefined
          : "[&:has(input:not(:placeholder-shown)):not(:focus-within)]:bg-background dark:[&:has(input:not(:placeholder-shown)):not(:focus-within)]:bg-transparent"
      }
    />
  );
}

// Marks the limit that currently applies.
export function ActiveLimitDot() {
  const { t } = useLingui();
  return (
    <span
      role="img"
      aria-label={t({
        message: "Active",
        context: "credit limit currently applied",
      })}
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-gradient-to-b from-highlight-400 to-highlight-500"
    />
  );
}

interface CreditLimitInputProps {
  label: string;
  value: string;
  readOnly: boolean;
  // Shown on hover when the field is read-only, to say why it is locked.
  readOnlyTooltip?: string;
  isActive?: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  description?: string;
  placeholder?: string;
  // Small text action rendered on the opposite end of the label row (e.g. to
  // clear the field). Omit when the field has nothing to clear back to.
  action?: { label: string; onClick: () => void };
}

export function CreditLimitInput({
  label,
  value,
  readOnly,
  readOnlyTooltip,
  isActive = false,
  validationMessage,
  onChange,
  description,
  placeholder,
  action,
}: CreditLimitInputProps) {
  const input = (
    <CreditLimitNumberInput
      value={value}
      readOnly={readOnly}
      validationMessage={validationMessage}
      onChange={onChange}
      description={description}
      placeholder={placeholder}
    />
  );
  return (
    <Page.Vertical gap="xs" align="stretch">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {isActive && <ActiveLimitDot />}
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

interface PersonalLimitInputProps {
  value: string;
  readOnly: boolean;
  isActive?: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
  // The remove action is only shown when a handler is given.
  onRemove?: () => void;
}

export function PersonalLimitInput({
  value,
  readOnly,
  isActive,
  validationMessage,
  onChange,
  onRemove,
}: PersonalLimitInputProps) {
  const { t } = useLingui();
  return (
    <CreditLimitInput
      label={t`Personal limit`}
      value={value}
      readOnly={readOnly}
      isActive={isActive}
      validationMessage={validationMessage}
      onChange={onChange}
      action={
        onRemove
          ? { label: t`Remove personal limit`, onClick: onRemove }
          : undefined
      }
    />
  );
}
