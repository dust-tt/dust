import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Microphone01, SliderToggle } from "@dust-tt/sparkle";

const LABEL = "Voice transcription";
const DESCRIPTION =
  "Whether members can use voice transcription in conversations.";

export function VoiceTranscriptionToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });
  const { subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();

  if (subscription.plan.isByok) {
    return null;
  }

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={LABEL}
        description={DESCRIPTION}
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
      title={LABEL}
      subElement="Allow voice transcription in Dust conversations"
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
