import {
  useUpdateUsageNotifications,
  useUsageNotifications,
} from "@app/lib/swr/usage_settings";
import {
  CoinsStacked03V2,
  Icon,
  Input,
  Page,
  SettingsList,
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

  const [balanceThresholdInput, setBalanceThresholdInput] =
    useState<string>("");
  const [isSavingBalanceThreshold, setIsSavingBalanceThreshold] =
    useState(false);

  useEffect(() => {
    // Defaults to 0 when no threshold is configured (warning off).
    setBalanceThresholdInput(
      String(usageNotifications.balanceThresholdCredits ?? 0)
    );
  }, [usageNotifications.balanceThresholdCredits]);

  const handleCommitBalanceThreshold = async () => {
    const currentThreshold = usageNotifications.balanceThresholdCredits ?? 0;
    const trimmed = balanceThresholdInput.trim();

    // An empty value falls back to 0 (warning off). The input only ever holds
    // digits (see onChange), so `next` is always a non-negative integer.
    const nextThreshold = trimmed === "" ? 0 : Number(trimmed);

    if (nextThreshold === currentThreshold) {
      return;
    }

    setIsSavingBalanceThreshold(true);
    try {
      const ok = await doUpdateUsageNotifications({
        balanceThresholdCredits: nextThreshold,
      });
      if (!ok) {
        // reset to the current value
        setBalanceThresholdInput(String(currentThreshold));
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
          title="Credit balance threshold"
          description="Email all workspace admins when your remaining credit balance drops below this amount (in credits). Set to 0 to disable."
          action={
            <div className="relative w-32">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                <Icon visual={CoinsStacked03V2} size="xs" />
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
                  isSavingBalanceThreshold || isUsageNotificationsLoading
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
