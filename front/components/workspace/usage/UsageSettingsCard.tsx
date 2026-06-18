import { LockedSection } from "@app/components/workspace/usage/LockedSection";
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
  hasPool: boolean;
}

export function UsageSettingsCard({
  workspaceId,
  readOnly,
  hasPool,
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
  const [isSavingAutoSeatUpgrade, setIsSavingAutoSeatUpgrade] = useState(false);
  const [isEditingDefaultLimit, setIsEditingDefaultLimit] = useState(false);

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

  const handleToggleAutoSeatUpgrade = async () => {
    setIsSavingAutoSeatUpgrade(true);
    try {
      await doUpdateUsageSettings({
        autoSeatUpgradeEnabled: !usageSettings.autoSeatUpgradeEnabled,
      });
    } finally {
      setIsSavingAutoSeatUpgrade(false);
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
      <span className="heading-base text-foreground dark:text-foreground-night">
        Spending policies
      </span>
      <SettingsList>
        <LockedSection locked={!hasPool}>
          <SettingsList.Row
            title="Default workspace credit pool limit"
            description={
              <>
                Define the workspace credit pool credit limit for users in your
                workspace. This limit is added on top of each seat&apos;s
                built-in allowance. Can be overridden per user in the members
                table. <strong>Set to 0 to remove pool access.</strong>
              </>
            }
            action={
              <div className="w-52">
                <InputWithSave
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="No access"
                  value={
                    currentDefaultLimit === null || currentDefaultLimit === 0
                      ? ""
                      : currentDefaultLimit.toLocaleString()
                  }
                  unit={
                    (currentDefaultLimit === null ||
                      currentDefaultLimit === 0) &&
                    !isEditingDefaultLimit
                      ? undefined
                      : "credits"
                  }
                  normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                  formatValue={(value) =>
                    value ? Number(value).toLocaleString() : value
                  }
                  onSave={handleSaveDefaultLimit}
                  onFocus={() => setIsEditingDefaultLimit(true)}
                  onBlur={() => setIsEditingDefaultLimit(false)}
                  disabled={readOnly || isDefaultUserSpendLimitLoading}
                />
              </div>
            }
          />
        </LockedSection>
        <SettingsList.Row
          title="Upgrade request"
          description="Allow members who reach their limit to request an upgrade. Workspace admins review requests on the this page."
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
        <SettingsList.Row
          title="Auto-upgrade seats"
          description="When a member reaches their credit limit, automatically move them to the next seat tier available in your plan (free → pro, pro → max) instead of blocking them. This may increase your subscription cost."
          action={
            <SliderToggle
              selected={usageSettings.autoSeatUpgradeEnabled}
              disabled={
                readOnly || isSavingAutoSeatUpgrade || isUsageSettingsLoading
              }
              onClick={() => void handleToggleAutoSeatUpgrade()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
