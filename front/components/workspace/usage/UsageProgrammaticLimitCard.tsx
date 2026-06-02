import {
  useProgrammaticUsageLimit,
  useUpdateProgrammaticUsageLimit,
} from "@app/lib/swr/usage_settings";
import {
  ActionCreditCoinsIcon,
  Icon,
  Input,
  Page,
  SettingsList,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

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

  const [limitInput, setLimitInput] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (programmaticUsageLimit?.monthlyCapCredits !== undefined) {
      setLimitInput(
        programmaticUsageLimit.monthlyCapCredits !== null
          ? String(programmaticUsageLimit.monthlyCapCredits)
          : ""
      );
    }
  }, [programmaticUsageLimit]);

  const handleCommitLimit = async () => {
    const current = programmaticUsageLimit?.monthlyCapCredits ?? null;

    if (limitInput.trim() === "") {
      if (current === null) {
        return;
      }
      setIsSaving(true);
      try {
        const result = await doUpdateProgrammaticUsageLimit(null);
        if (!result) {
          setLimitInput(current !== null ? String(current) : "");
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }

    const parsed = Number(limitInput);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed === current) {
      setLimitInput(current !== null ? String(current) : "");
      return;
    }

    setIsSaving(true);
    try {
      const result = await doUpdateProgrammaticUsageLimit(parsed);
      if (!result) {
        setLimitInput(current !== null ? String(current) : "");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isInputDisabled = isSaving || isProgrammaticUsageLimitLoading;

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
          description="Maximum credits allowed for programmatic usage per month"
          action={
            <div className="relative w-32">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                <Icon visual={ActionCreditCoinsIcon} size="xs" />
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="No limit"
                value={limitInput}
                onChange={(e) =>
                  setLimitInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={() => void handleCommitLimit()}
                disabled={isInputDisabled}
                className="pl-8 text-right"
              />
            </div>
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
