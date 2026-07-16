import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Microphone01, SliderToggle } from "@dust-tt/sparkle";

export function VoiceTranscriptionToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();

  const label = "Voice transcription";
  const description = "Allow voice transcription in Dust conversations";

  if (subscription.plan.isByok) {
    return null;
  }

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={label}
        description={description}
        action={
          <SliderToggle
            selected={isEnabled}
            disabled={isChanging}
            onClick={doToggleVoiceTranscription}
          />
        }
      />
    );
  }

  return (
    <ContextItem
      title={label}
      subElement={description}
      visual={<Microphone01 className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
        <SliderToggle
          selected={isEnabled}
          disabled={isChanging}
          onClick={doToggleVoiceTranscription}
        />
      }
    />
  );
}
