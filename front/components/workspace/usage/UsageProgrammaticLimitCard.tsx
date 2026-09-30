import { formatNumber } from "@app/lib/i18n/format";
import {
  useProgrammaticUsageLimit,
  useUpdateProgrammaticUsageLimit,
} from "@app/lib/swr/usage_settings";
import { InputWithSave, Page, SettingsList } from "@dust-tt/sparkle";
import { useState } from "react";

export const PROGRAMMATIC_USAGE_SECTION_LABEL = "Programmatic usage";
export const PROGRAMMATIC_MONTHLY_LIMIT_LABEL = "Programmatic monthly limit";

interface UsageProgrammaticLimitCardProps {
  workspaceId: string;
}

export function UsageProgrammaticLimitCard({
  workspaceId,
}: UsageProgrammaticLimitCardProps) {
  const { programmaticUsageLimit, isProgrammaticUsageLimitLoading } =
    useProgrammaticUsageLimit({ workspaceId });
  const { doUpdateProgrammaticUsageLimit } = useUpdateProgrammaticUsageLimit({
    workspaceId,
  });

  const currentLimit = programmaticUsageLimit?.monthlyCapCredits ?? 0;

  const [isEditing, setIsEditing] = useState(false);

  const handleSaveLimit = async (newValue: string) => {
    const trimmed = newValue.trim();

    // An empty value means no programmatic access: save 0 so the cap blocks
    // access. There is no "no cap" / unlimited state.
    if (trimmed === "") {
      if (currentLimit === 0) {
        return;
      }
      await doUpdateProgrammaticUsageLimit(0);
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === currentLimit) {
      // The component reverts to the current value when nothing is persisted.
      return;
    }
    await doUpdateProgrammaticUsageLimit(parsed);
  };

  return (
    <Page.Vertical gap="sm" align="stretch">
      <div className="flex flex-col gap-0.5">
        <span className="heading-base text-foreground">
          {PROGRAMMATIC_USAGE_SECTION_LABEL}
        </span>
      </div>
      <SettingsList>
        <SettingsList.Row
          title={PROGRAMMATIC_MONTHLY_LIMIT_LABEL}
          description={
            <>
              Maximum credits allowed for programmatic usage per month.{" "}
              <strong> Set to 0 to block all programmatic access. </strong>
            </>
          }
          action={
            <div className="w-52">
              <InputWithSave
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="No access"
                value={currentLimit === 0 ? "" : formatNumber(currentLimit)}
                unit={currentLimit === 0 && !isEditing ? undefined : "credits"}
                normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                formatValue={(value) =>
                  value ? formatNumber(Number(value)) : value
                }
                onSave={handleSaveLimit}
                onFocus={() => setIsEditing(true)}
                onBlur={() => setIsEditing(false)}
                disabled={isProgrammaticUsageLimitLoading}
              />
            </div>
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
