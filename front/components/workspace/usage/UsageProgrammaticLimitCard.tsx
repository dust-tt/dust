import {
  useProgrammaticUsageLimit,
  useUpdateProgrammaticUsageLimit,
} from "@app/lib/swr/usage_settings";
import { InputWithSave, Page, SettingsList } from "@dust-tt/sparkle";

interface UsageProgrammaticLimitCardProps {
  workspaceId: string;
  readOnly: boolean;
}

export function UsageProgrammaticLimitCard({
  workspaceId,
  readOnly,
}: UsageProgrammaticLimitCardProps) {
  const { programmaticUsageLimit, isProgrammaticUsageLimitLoading } =
    useProgrammaticUsageLimit({ workspaceId });
  const { doUpdateProgrammaticUsageLimit } = useUpdateProgrammaticUsageLimit({
    workspaceId,
  });

  const currentLimit = programmaticUsageLimit?.monthlyCapCredits ?? null;

  const handleSaveLimit = async (newValue: string) => {
    const trimmed = newValue.trim();

    // An empty value means no limit.
    if (trimmed === "") {
      if (currentLimit === null) {
        return;
      }
      await doUpdateProgrammaticUsageLimit(null);
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
        <span className="heading-base text-foreground dark:text-foreground-night">
          Programmatic usage
        </span>
      </div>
      <SettingsList>
        <SettingsList.Row
          title="Programmatic monthly limit"
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
                placeholder="No limit"
                value={currentLimit !== null ? String(currentLimit) : ""}
                unit="credits"
                normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                onSave={handleSaveLimit}
                disabled={readOnly || isProgrammaticUsageLimitLoading}
              />
            </div>
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
