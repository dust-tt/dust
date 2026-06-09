import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import type { WorkspaceType } from "@app/types/user";
import { ContextItem, Microphone01, SliderToggle } from "@dust-tt/sparkle";

export function VoiceTranscriptionToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });

  return (
    <ContextItem
      title="Voice transcription"
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
