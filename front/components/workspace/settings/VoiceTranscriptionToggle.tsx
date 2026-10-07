import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { SliderToggle } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface VoiceTranscriptionToggleProps {
  owner: WorkspaceType;
}

export function VoiceTranscriptionToggle({
  owner,
}: VoiceTranscriptionToggleProps) {
  const { t } = useLingui();
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });
  const { subscription } = useAuth();

  if (subscription.plan.isByok) {
    return null;
  }

  return (
    <GovernanceSettingRowLayout
      label={t`Voice transcription`}
      description={t`Whether members can use voice transcription in conversations`}
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
