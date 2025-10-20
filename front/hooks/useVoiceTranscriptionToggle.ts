import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";

interface UseVoiceTranscriptionToggleProps {
  owner: LightWorkspaceType;
}

export function useVoiceTranscriptionToggle({
  owner,
}: UseVoiceTranscriptionToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowVoiceTranscription !== false
  );

  const doToggleVoiceTranscription = async () => {
    setIsChanging(true);
    try {
      const res = await fetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowVoiceTranscription: !isEnabled,
        }),
      });
      setIsEnabled(!isEnabled);

      if (!res.ok) {
        throw new Error("Failed to update Voice transcription setting");
      }
    } catch (error) {
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
