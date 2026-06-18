import {
  useUpdateUsageNotifications,
  useUsageNotifications,
} from "@app/lib/swr/usage_settings";
import {
  InputWithSave,
  Page,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface UsageNotificationsCardProps {
  workspaceId: string;
  readOnly: boolean;
}

export function UsageNotificationsCard({
  workspaceId,
  readOnly,
}: UsageNotificationsCardProps) {
  const { usageNotifications, isUsageNotificationsLoading } =
    useUsageNotifications({ workspaceId });
  const { doUpdateUsageNotifications } = useUpdateUsageNotifications({
    workspaceId,
  });

  const [isSavingUpgradeRequestEmail, setIsSavingUpgradeRequestEmail] =
    useState(false);
  const [isEditingThreshold, setIsEditingThreshold] = useState(false);

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

  // Defaults to 0 when no threshold is configured (warning off).
  const currentThreshold = usageNotifications.balanceThresholdCredits ?? 0;

  const handleSaveBalanceThreshold = async (newValue: string) => {
    const trimmed = newValue.trim();

    // An empty value falls back to 0 (warning off). The input only ever holds
    // digits (see normalizeValue), so `nextThreshold` is always a non-negative
    // integer.
    const nextThreshold = trimmed === "" ? 0 : Number(trimmed);

    if (nextThreshold === currentThreshold) {
      return;
    }

    await doUpdateUsageNotifications({
      balanceThresholdCredits: nextThreshold,
    });
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
          title="Workspace credit pool threshold"
          description={
            <>
              Email all workspace admins when your remaining workspace credit
              pool balance drops below this amount.{" "}
              <strong>Set to 0 to disable.</strong>
            </>
          }
          action={
            <div className="w-52">
              <InputWithSave
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Disabled"
                value={
                  currentThreshold === 0
                    ? ""
                    : currentThreshold.toLocaleString()
                }
                unit={
                  currentThreshold === 0 && !isEditingThreshold
                    ? undefined
                    : "credits"
                }
                normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                formatValue={(value) =>
                  value ? Number(value).toLocaleString() : value
                }
                onSave={handleSaveBalanceThreshold}
                onFocus={() => setIsEditingThreshold(true)}
                onBlur={() => setIsEditingThreshold(false)}
                disabled={readOnly || isUsageNotificationsLoading}
              />
            </div>
          }
        />
        <SettingsList.Row
          title="Upgrade request emails"
          description="Email all workspace admins when a member requests a spend-limit upgrade."
          action={
            <SliderToggle
              selected={usageNotifications.upgradeRequestEmail}
              disabled={
                readOnly ||
                isSavingUpgradeRequestEmail ||
                isUsageNotificationsLoading
              }
              onClick={() => void handleToggleUpgradeRequestEmail()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
