import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import { formatNumber } from "@app/lib/i18n/format";
import {
  useUpdateUsageSettings,
  useUsageSettings,
} from "@app/lib/swr/usage_settings";
import { Page, SettingsList, SliderToggle } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

interface CreditSpendCheckpointSettingsCardProps {
  workspaceId: string;
}

export function CreditSpendCheckpointSettingsCard({
  workspaceId,
}: CreditSpendCheckpointSettingsCardProps) {
  const { t } = useLingui();
  const { usageSettings, isUsageSettingsLoading } = useUsageSettings({
    workspaceId,
  });
  const { doUpdateUsageSettings, isUpdatingUsageSettings } =
    useUpdateUsageSettings({ workspaceId });

  const handleToggleCreditSpendCheckpointEnabled = async () => {
    await doUpdateUsageSettings({
      creditSpendCheckpointEnabled: !usageSettings.creditSpendCheckpointEnabled,
    });
  };

  const thresholdCredits = formatNumber(
    CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS
  );

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-base text-foreground">
        <Trans>Cost management</Trans>
      </span>
      <SettingsList>
        <SettingsList.Row
          title={t`Credit spend checkpoint`}
          description={t`Pause the agent and ask the user to confirm continuing once a single message's LLM token spend reaches ${thresholdCredits} credits.`}
          action={
            <SliderToggle
              selected={usageSettings.creditSpendCheckpointEnabled}
              disabled={isUpdatingUsageSettings || isUsageSettingsLoading}
              onClick={() => void handleToggleCreditSpendCheckpointEnabled()}
            />
          }
        />
      </SettingsList>
    </Page.Vertical>
  );
}
