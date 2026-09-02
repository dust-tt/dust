import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";

export const VOICE_TRANSCRIPTION_LABEL = "Voice transcription";
export const VOICE_TRANSCRIPTION_DESCRIPTION =
  "Whether members can use voice transcription in conversations";

export function VoiceTranscriptionToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });
  const { subscription } = useAuth();

  if (subscription.plan.isByok) {
    return null;
  }

  return (
    <GovernanceSettingRowLayout
      label={VOICE_TRANSCRIPTION_LABEL}
      description={VOICE_TRANSCRIPTION_DESCRIPTION}
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
