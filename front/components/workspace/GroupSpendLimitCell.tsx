import type { GroupSpendLimit } from "@app/types/api/groups/spend_limit";
import { InputWithSave } from "@dust-tt/sparkle";
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
        placeholder="No limit"
        value={current === null ? "" : current.toLocaleString()}
        unit={current === null && !isEditing ? undefined : "credits/month"}
        normalizeValue={(value) => value.replace(/[^\d]/g, "")}
        formatValue={(value) =>
          value ? Number(value).toLocaleString() : value
        }
        onSave={handleSave}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
        disabled={disabled}
      />
    </div>
  );
}
