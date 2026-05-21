import { UsageSettingRow } from "@app/components/workspace/usage/UsageSettingRow";
import {
  useUpdateUsageNotifications,
  useUsageNotifications,
} from "@app/lib/swr/usage_settings";
import { Input, Page, SliderToggle } from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface UsageNotificationsCardProps {
  workspaceId: string;
}

const MIN_USAGE_ALERT_PERCENT = 0;
const MAX_USAGE_ALERT_PERCENT = 100;

export function UsageNotificationsCard({
  workspaceId,
}: UsageNotificationsCardProps) {
  const { usageNotifications } = useUsageNotifications({ workspaceId });
  const { doUpdateUsageNotifications } = useUpdateUsageNotifications({
    workspaceId,
  });

  const [alertPercentInput, setAlertPercentInput] = useState<string>(
    String(usageNotifications.creditUsageAlertPercent)
  );
  const [isSavingAlertPercent, setIsSavingAlertPercent] = useState(false);
  const [isSavingCreditCapWarning, setIsSavingCreditCapWarning] =
    useState(false);
  const [isSavingUpgradeRequestEmail, setIsSavingUpgradeRequestEmail] =
    useState(false);

  useEffect(() => {
    setAlertPercentInput(String(usageNotifications.creditUsageAlertPercent));
  }, [usageNotifications.creditUsageAlertPercent]);

  const handleCommitAlertPercent = async () => {
    const parsed = Number(alertPercentInput);
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_USAGE_ALERT_PERCENT ||
      parsed > MAX_USAGE_ALERT_PERCENT ||
      parsed === usageNotifications.creditUsageAlertPercent
    ) {
      setAlertPercentInput(String(usageNotifications.creditUsageAlertPercent));
      return;
    }
    setIsSavingAlertPercent(true);
    try {
      await doUpdateUsageNotifications({ creditUsageAlertPercent: parsed });
    } finally {
      setIsSavingAlertPercent(false);
    }
  };

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

  const handleToggleUpgradeRequestEmail = async () => {
    setIsSavingUpgradeRequestEmail(true);
    try {
      await doUpdateUsageNotifications({
        upgradeRequestEmail: !usageNotifications.upgradeRequestEmail,
      });
    } finally {
      setIsSavingUpgradeRequestEmail(false);
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
      <div className="rounded-2xl border border-border dark:border-border-night">
        <UsageSettingRow
          isFirst
          title="Credit usage alert"
          description="Get an email when your workspace has used a percentage of its allocated credits."
          action={
            <div className="relative w-28">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={alertPercentInput}
                onChange={(e) =>
                  setAlertPercentInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={() => void handleCommitAlertPercent()}
                disabled={isSavingAlertPercent}
                className="pr-8"
              />
              <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground dark:text-muted-foreground-night">
                %
              </div>
            </div>
          }
        />
        <UsageSettingRow
          title="Credit cap warning"
          description="Get an email before your workspace hits its credit cap. Sent to all workspace admins."
          action={
            <SliderToggle
              selected={usageNotifications.creditCapWarning}
              disabled={isSavingCreditCapWarning}
              onClick={() => void handleToggleCreditCapWarning()}
            />
          }
        />
        <UsageSettingRow
          title="Upgrade request"
          description="Receive an email when a user of your workspace is requesting an upgrade"
          action={
            <SliderToggle
              selected={usageNotifications.upgradeRequestEmail}
              disabled={isSavingUpgradeRequestEmail}
              onClick={() => void handleToggleUpgradeRequestEmail()}
            />
          }
        />
      </div>
    </Page.Vertical>
  );
}
