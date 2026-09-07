import { Chip, Input, Page } from "@dust-tt/sparkle";

interface MemberPersonalLimitInputProps {
  value: string;
  readOnly: boolean;
  isHighest: boolean;
  validationMessage: string | null;
  onChange: (cleaned: string) => void;
}

export function MemberPersonalLimitInput({
  value,
  readOnly,
  isHighest,
  validationMessage,
  onChange,
}: MemberPersonalLimitInputProps) {
  return (
    <Page.Vertical gap="xs" align="stretch">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          Personal limit
        </span>
        {isHighest && <Chip size="mini" color="highlight" label="Highest" />}
      </div>
      <Input
        size="sm"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="0"
        disabled={readOnly}
        value={value !== "" ? Number(value).toLocaleString() : ""}
        onChange={(e) => {
          onChange(e.target.value.replace(/[^\d]/g, ""));
        }}
        isError={validationMessage !== null}
        message={validationMessage ?? undefined}
        messageStatus={validationMessage !== null ? "error" : undefined}
        suffix="credits/month"
        isUnit
      />
    </Page.Vertical>
  );
}
