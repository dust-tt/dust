import {
  useDefaultUserSpendLimit,
  useUpdateDefaultUserSpendLimit,
  useUpdateUsageSettings,
  useUsageSettings,
} from "@app/lib/swr/usage_settings";
import {
  MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
  MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS,
} from "@app/types/credits";
import {
  InputWithSave,
  Page,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface UsageSettingsCardProps {
  workspaceId: string;
  readOnly: boolean;
}

export function UsageSettingsCard({
  workspaceId,
  readOnly,
}: UsageSettingsCardProps) {
  const { defaultUserSpendLimit, isDefaultUserSpendLimitLoading } =
    useDefaultUserSpendLimit({ workspaceId });
  const { doUpdateDefaultUserSpendLimit } = useUpdateDefaultUserSpendLimit({
    workspaceId,
  });
  const { usageSettings, isUsageSettingsLoading } = useUsageSettings({
    workspaceId,
  });
  const { doUpdateUsageSettings } = useUpdateUsageSettings({ workspaceId });

  const [isSavingAllowUpgradeRequest, setIsSavingAllowUpgradeRequest] =
    useState(false);

  const handleToggleAllowUpgradeRequest = async () => {
    setIsSavingAllowUpgradeRequest(true);
    try {
      await doUpdateUsageSettings({
        allowUpgradeRequest: !usageSettings.allowUpgradeRequest,
      });
    } finally {
      setIsSavingAllowUpgradeRequest(false);
    }
  };

  const currentDefaultLimit = defaultUserSpendLimit?.awuCredits ?? null;

  const handleSaveDefaultLimit = async (newValue: string) => {
    const parsed = Number(newValue);
    if (
      !Number.isInteger(parsed) ||
      parsed < MIN_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
      parsed > MAX_DEFAULT_USER_SPEND_LIMIT_AWU_CREDITS ||
      parsed === currentDefaultLimit
    ) {
      // The component reverts to the current value when nothing is persisted.
      return;
    }
    await doUpdateDefaultUserSpendLimit(parsed);
  };

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-2xl text-foreground dark:text-foreground-night">
        Settings
      </span>
      <SettingsList>
        <SettingsList.Row
          title="Default pool credit limit"
          description="Define the pool credit limit for users in your workspace. This limit is added on top of each seat's built-in allowance."
          action={
            <div className="w-40">
              <InputWithSave
                inputMode="numeric"
                pattern="[0-9]*"
                value={
                  currentDefaultLimit !== null
                    ? String(currentDefaultLimit)
                    : ""
                }
                unit="credits"
                normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                onSave={handleSaveDefaultLimit}
                disabled={readOnly || isDefaultUserSpendLimitLoading}
              />
            </div>
          }
        />
        <SettingsList.Row
          title="Upgrade request"
          description="Allow members who reach their pool credit limit to request an upgrade. Workspace admins review requests on the Usage page."
          action={
            <SliderToggle
              selected={usageSettings.allowUpgradeRequest}
              disabled={
                readOnly ||
                isSavingAllowUpgradeRequest ||
                isUsageSettingsLoading
              }
              onClick={() => void handleToggleAllowUpgradeRequest()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
