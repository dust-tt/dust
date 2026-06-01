import {
  useUpdateUsageNotifications,
  useUsageNotifications,
} from "@app/lib/swr/usage_settings";
import {
  ActionCreditCoinsIcon,
  Icon,
  Input,
  Page,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface UsageNotificationsCardProps {
  workspaceId: string;
}

export function UsageNotificationsCard({
  workspaceId,
}: UsageNotificationsCardProps) {
  const { usageNotifications, isUsageNotificationsLoading } =
    useUsageNotifications({ workspaceId });
  const { doUpdateUsageNotifications } = useUpdateUsageNotifications({
    workspaceId,
  });

  const [isSavingCreditCapWarning, setIsSavingCreditCapWarning] =
    useState(false);

  const [balanceThresholdInput, setBalanceThresholdInput] =
    useState<string>("");
  const [isSavingBalanceThreshold, setIsSavingBalanceThreshold] =
    useState(false);

  useEffect(() => {
    // Defaults to 0 when nothing is configured yet (null in the db).
    setBalanceThresholdInput(
      String(usageNotifications.balanceThresholdCredits ?? 0)
    );
  }, [usageNotifications.balanceThresholdCredits]);

  const handleToggleCreditCapWarning = async () => {
    setIsSavingCreditCapWarning(true);
    try {
      await doUpdateUsageNotifications({
        creditCapWarning: !usageNotifications.creditCapWarning,
      });
    } finally {
      setIsSavingCreditCapWarning(false);
    }
  };

  const handleCommitBalanceThreshold = async () => {
    const current = usageNotifications.balanceThresholdCredits ?? 0;
    const trimmed = balanceThresholdInput.trim();

    // An empty value falls back to the default of 0.
    const next = trimmed === "" ? 0 : Number(trimmed);

    if (!Number.isInteger(next) || next < 0) {
      setBalanceThresholdInput(String(current));
      return;
    }

    if (next === current) {
      setBalanceThresholdInput(String(current));
      return;
    }

    setIsSavingBalanceThreshold(true);
    try {
      const ok = await doUpdateUsageNotifications({
        balanceThresholdCredits: next,
      });
      if (!ok) {
        setBalanceThresholdInput(String(current));
      }
    } finally {
      setIsSavingBalanceThreshold(false);
    }
  };

  return (
    <Page.Vertical gap="sm" align="stretch">
      <div className="flex flex-col gap-0.5">
        <span className="heading-base text-foreground dark:text-foreground-night">
          Notifications
        </span>
        <Page.P variant="secondary">
          Customize when and how you receive usage based notification
        </Page.P>
      </div>
      <SettingsList>
        <SettingsList.Row
          title="Credit cap warning"
          description="Email all workspace admins when your remaining credit balance falls below the threshold set below."
          action={
            <SliderToggle
              selected={usageNotifications.creditCapWarning}
              disabled={isSavingCreditCapWarning}
              onClick={() => void handleToggleCreditCapWarning()}
            />
          }
        />
        <SettingsList.Row
          title="Credit balance threshold"
          description="The remaining credit balance, in credits, at which the warning email is sent."
          action={
            <div className="relative w-32">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                <Icon visual={ActionCreditCoinsIcon} size="xs" />
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={balanceThresholdInput}
                onChange={(e) =>
                  setBalanceThresholdInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={() => void handleCommitBalanceThreshold()}
                disabled={
                  isSavingBalanceThreshold ||
                  isUsageNotificationsLoading ||
                  !usageNotifications.creditCapWarning
                }
                className="pl-8 text-right"
              />
            </div>
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
