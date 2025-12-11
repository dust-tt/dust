import { ContextItem, MicIcon, SliderToggle } from "@dust-tt/sparkle";

import { useVoiceTranscriptionToggle } from "@app/hooks/useVoiceTranscriptionToggle";
import type { WorkspaceType } from "@app/types";

export function VoiceTranscriptionToggle({ owner }: { owner: WorkspaceType }) {
  const { isEnabled, isChanging, doToggleVoiceTranscription } =
    useVoiceTranscriptionToggle({ owner });

  return (
    <ContextItem
      title="Voice transcription"
      subElement="Allow voice transcription in Dust conversations"
      visual={<MicIcon className="h-6 w-6" />}
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
