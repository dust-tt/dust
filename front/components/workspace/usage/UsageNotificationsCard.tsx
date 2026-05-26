import {
  useUpdateUsageNotifications,
  useUsageNotifications,
} from "@app/lib/swr/usage_settings";
import { Page, SettingsList, SliderToggle } from "@dust-tt/sparkle";
import { useState } from "react";

interface UsageNotificationsCardProps {
  workspaceId: string;
}

export function UsageNotificationsCard({
  workspaceId,
}: UsageNotificationsCardProps) {
  const { usageNotifications } = useUsageNotifications({ workspaceId });
  const { doUpdateUsageNotifications } = useUpdateUsageNotifications({
    workspaceId,
  });

  const [isSavingCreditCapWarning, setIsSavingCreditCapWarning] =
    useState(false);

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
          description="Get an email before your workspace hits 80% of its credit cap. Sent to all workspace admins."
          action={
            <SliderToggle
              selected={usageNotifications.creditCapWarning}
              disabled={isSavingCreditCapWarning}
              onClick={() => void handleToggleCreditCapWarning()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
