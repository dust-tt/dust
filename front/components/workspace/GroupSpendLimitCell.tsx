import { formatNumber } from "@app/lib/i18n/format";
import type { GroupSpendLimit } from "@app/types/api/groups/spend_limit";
import { InputWithSave } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

export interface GroupSpendLimitRowData {
  groupId: string;
  name: string;
  poolCapAwuCredits: number | null;
}

interface GroupSpendLimitCellProps {
  group: GroupSpendLimitRowData;
  onSave: (
    group: GroupSpendLimitRowData,
    limit: GroupSpendLimit
  ) => Promise<void>;
  disabled?: boolean;
}

export function GroupSpendLimitCell({
  group,
  onSave,
  disabled,
}: GroupSpendLimitCellProps) {
  const { t } = useLingui();
  const [isEditing, setIsEditing] = useState(false);
  const current = group.poolCapAwuCredits;

  const handleSave = async (newValue: string) => {
    const trimmed = newValue.trim();
    if (trimmed === "") {
      if (current === null) {
        return;
      }
      await onSave(group, { kind: "unlimited" });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === current) {
      return;
    }
    await onSave(group, { kind: "limited", awuCredits: parsed });
  };

  return (
    <div className="w-60">
      <InputWithSave
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder={t`No limit`}
        value={current === null ? "" : formatNumber(current)}
        unit={current === null && !isEditing ? undefined : t`credits/month`}
        normalizeValue={(value) => value.replace(/[^\d]/g, "")}
        formatValue={(value) => (value ? formatNumber(Number(value)) : value)}
        onSave={handleSave}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        disabled={disabled}
      />
    </div>
  );
}
