import { CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS } from "@app/lib/constants/credits";
import {
  useUpdateUsageSettings,
  useUsageSettings,
} from "@app/lib/swr/usage_settings";
import { Page, SettingsList, SliderToggle } from "@dust-tt/sparkle";

interface CreditSpendCheckpointSettingsCardProps {
  workspaceId: string;
}

export function CreditSpendCheckpointSettingsCard({
  workspaceId,
}: CreditSpendCheckpointSettingsCardProps) {
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

  return (
    <Page.Vertical gap="sm" align="stretch">
      <span className="heading-base text-foreground">Cost management</span>
      <SettingsList>
        <SettingsList.Row
          title="Credit spend checkpoint"
          description={`Pause the agent and ask the user to confirm continuing once a single message's LLM token spend reaches ${CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS.toLocaleString()} credits.`}
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
