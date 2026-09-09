import { parseDefaultLimitInput } from "@app/components/workspace/member_spend_limit_helpers";
import { LockedSection } from "@app/components/workspace/usage/LockedSection";
import {
  useDefaultUserSpendLimit,
  useUpdateDefaultUserSpendLimit,
  useUpdateUsageSettings,
  useUsageSettings,
} from "@app/lib/swr/usage_settings";
import {
  InputWithSave,
  Page,
  SettingsList,
  SliderToggle,
} from "@dust-tt/sparkle";

interface UsageSettingsCardProps {
  workspaceId: string;
  hasPool: boolean;
}

function validateDefaultLimit(value: string) {
  const parseResult = parseDefaultLimitInput(value);
  return parseResult.ok ? null : parseResult.message;
}

export function UsageSettingsCard({
  workspaceId,
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
  const { doUpdateUsageSettings, isUpdatingUsageSettings } =
    useUpdateUsageSettings({ workspaceId });

  const handleToggleAllowUpgradeRequest = async () => {
    await doUpdateUsageSettings({
      allowUpgradeRequest: !usageSettings.allowUpgradeRequest,
    });
  };

  const handleToggleRequireUpgradeRequestReason = async () => {
    await doUpdateUsageSettings({
      requireUpgradeRequestReason: !usageSettings.requireUpgradeRequestReason,
    });
  };

  const handleToggleAutoSeatUpgrade = async () => {
    await doUpdateUsageSettings({
      autoSeatUpgradeEnabled: !usageSettings.autoSeatUpgradeEnabled,
    });
  };

  const currentDefaultLimit = defaultUserSpendLimit?.awuCredits ?? null;

  const handleSaveDefaultLimit = async (newValue: string) => {
    const parseResult = parseDefaultLimitInput(newValue);
    if (!parseResult.ok || parseResult.awuCredits === currentDefaultLimit) {
      // Invalid input is caught by `validate` before this runs; an unchanged
      // value is simply a no-op save.
      return;
    }
    await doUpdateDefaultUserSpendLimit(parseResult.awuCredits);
  };

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-base text-foreground">Spending policies</span>
      <SettingsList>
        <LockedSection locked={!hasPool}>
          <SettingsList.Row
            title="Default per-user workspace credit pool monthly limit"
            description={
              <>
                Define the workspace credit pool credit limit for users per
                month in your workspace. This limit is added on top of each
                seat&apos;s built-in allowance. Can be overridden per user in
                the members table.{" "}
                <strong>Set to 0 to remove pool access.</strong>
              </>
            }
            action={
              <div className="w-60">
                <InputWithSave
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="--"
                  value={currentDefaultLimit?.toLocaleString() ?? ""}
                  unit="credits/month"
                  normalizeValue={(value) => value.replace(/[^\d]/g, "")}
                  formatValue={(value) =>
                    value ? Number(value).toLocaleString() : value
                  }
                  validate={validateDefaultLimit}
                  onSave={handleSaveDefaultLimit}
                  disabled={isDefaultUserSpendLimitLoading}
                />
              </div>
            }
          />
        </LockedSection>
        <SettingsList.Row
          title="Upgrade request"
          description="Allow members who reach their limit to request an upgrade. Workspace admins and managers review requests on the this page."
          action={
            <SliderToggle
              selected={usageSettings.allowUpgradeRequest}
              disabled={isUpdatingUsageSettings || isUsageSettingsLoading}
              onClick={() => void handleToggleAllowUpgradeRequest()}
            />
          }
        />
        <LockedSection
          locked={!usageSettings.allowUpgradeRequest}
          tooltipContent="Enable upgrade requests to enable this setting"
        >
          <SettingsList.Row
            title="Require a reason for upgrade requests"
            description="Members must explain why they need an upgrade before their request can be submitted."
            action={
              <SliderToggle
                selected={
                  usageSettings.allowUpgradeRequest &&
                  usageSettings.requireUpgradeRequestReason
                }
                disabled={
                  isUpdatingUsageSettings ||
                  isUsageSettingsLoading ||
                  !usageSettings.allowUpgradeRequest
                }
                onClick={() => void handleToggleRequireUpgradeRequestReason()}
              />
            }
          />
        </LockedSection>
        <SettingsList.Row
          title="Auto-upgrade seats"
          description={
            usageSettings.autoSeatUpgradeAvailable ? (
              "When a member reaches their credit limit, automatically move them to the next seat tier available in your plan (free → pro, pro → max) instead of blocking them. This may increase your subscription cost."
            ) : (
              <>
                When a member reaches their credit limit, automatically move
                them to the next seat tier available in your plan (free → pro,
                pro → max) instead of blocking them.{" "}
                <strong>
                  Auto-upgrade isn't available on your current plan. Upgrade to
                  a paid plan to enable it.
                </strong>
              </>
            )
          }
          action={
            <SliderToggle
              selected={
                usageSettings.autoSeatUpgradeAvailable &&
                usageSettings.autoSeatUpgradeEnabled
              }
              disabled={
                isUpdatingUsageSettings ||
                isUsageSettingsLoading ||
                !usageSettings.autoSeatUpgradeAvailable
              }
              onClick={() => void handleToggleAutoSeatUpgrade()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
