import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseVoiceTranscriptionToggleProps {
  owner: LightWorkspaceType;
}

export function useVoiceTranscriptionToggle({
  owner,
}: UseVoiceTranscriptionToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowVoiceTranscription !== false
  );

  const doToggleVoiceTranscription = async () => {
    setIsChanging(true);
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}`,
        {
          allowVoiceTranscription: !isEnabled,
        },
        "POST",
      ]);
      setIsEnabled(!isEnabled);
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to update Voice transcription setting",
        description: "Could not update the Voice transcription setting.",
      });
    }
    setIsChanging(false);
  };

  return {
    isEnabled,
    isChanging,
    doToggleVoiceTranscription,
  };
}
