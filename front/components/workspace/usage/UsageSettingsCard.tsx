import { UsageSettingRow } from "@app/components/workspace/usage/UsageSettingRow";
import {
  useUpdateUsageSettings,
  useUsageSettings,
} from "@app/lib/swr/usage_settings";
import {
  ActionCreditCoinsIcon,
  Icon,
  Input,
  Page,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

interface UsageSettingsCardProps {
  workspaceId: string;
}

export function UsageSettingsCard({ workspaceId }: UsageSettingsCardProps) {
  const { usageSettings } = useUsageSettings({ workspaceId });
  const { doUpdateUsageSettings } = useUpdateUsageSettings({ workspaceId });

  const [defaultLimitInput, setDefaultLimitInput] = useState<string>(
    String(usageSettings.defaultUsageLimitCredits)
  );
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  useEffect(() => {
    setDefaultLimitInput(String(usageSettings.defaultUsageLimitCredits));
  }, [usageSettings.defaultUsageLimitCredits]);

  const [isSavingAllowUpgrade, setIsSavingAllowUpgrade] = useState(false);
  const [isSavingAutoUpgrade, setIsSavingAutoUpgrade] = useState(false);

  const handleToggleAllowUpgradeRequest = async () => {
    setIsSavingAllowUpgrade(true);
    try {
      await doUpdateUsageSettings({
        allowUpgradeRequest: !usageSettings.allowUpgradeRequest,
      });
    } finally {
      setIsSavingAllowUpgrade(false);
    }
  };

  const handleToggleAutoUpgradeFreeToPro = async () => {
    setIsSavingAutoUpgrade(true);
    try {
      await doUpdateUsageSettings({
        autoUpgradeFreeToPro: !usageSettings.autoUpgradeFreeToPro,
      });
    } finally {
      setIsSavingAutoUpgrade(false);
    }
  };

  const handleCommitDefaultLimit = async () => {
    const parsed = Number(defaultLimitInput);
    if (
      !Number.isInteger(parsed) ||
      parsed < 0 ||
      parsed === usageSettings.defaultUsageLimitCredits
    ) {
      setDefaultLimitInput(String(usageSettings.defaultUsageLimitCredits));
      return;
    }
    setIsSavingLimit(true);
    try {
      await doUpdateUsageSettings({ defaultUsageLimitCredits: parsed });
    } finally {
      setIsSavingLimit(false);
    }
  };

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-2xl text-foreground dark:text-foreground-night">
        Settings
      </span>
      <div className="rounded-2xl border border-border dark:border-border-night">
        <UsageSettingRow
          isFirst
          title="Upgrade request"
          description="Allow users to request plan upgrades and limit increase"
          action={
            <SliderToggle
              selected={usageSettings.allowUpgradeRequest}
              disabled={isSavingAllowUpgrade}
              onClick={() => void handleToggleAllowUpgradeRequest()}
            />
          }
        />
        <UsageSettingRow
          title="Auto upgrade Free to Pro"
          description="Automatically upgrade free users to pro plan when they reach their limit"
          action={
            <SliderToggle
              selected={usageSettings.autoUpgradeFreeToPro}
              disabled={isSavingAutoUpgrade}
              onClick={() => void handleToggleAutoUpgradeFreeToPro()}
            />
          }
        />
        <UsageSettingRow
          title="Default usage limit"
          description="Define the default usage limit for all the users in your workspace"
          action={
            <div className="relative w-32">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground dark:text-muted-foreground-night">
                <Icon visual={ActionCreditCoinsIcon} size="xs" />
              </div>
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={defaultLimitInput}
                onChange={(e) =>
                  setDefaultLimitInput(e.target.value.replace(/[^\d]/g, ""))
                }
                onBlur={() => void handleCommitDefaultLimit()}
                disabled={isSavingLimit}
                className="pl-8 text-right"
              />
            </div>
          }
        />
      </div>
    </Page.Vertical>
  );
}
