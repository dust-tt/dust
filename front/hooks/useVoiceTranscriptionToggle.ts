import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isVoiceTranscriptionAllowed } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseVoiceTranscriptionToggleProps {
  owner: LightWorkspaceType;
}

export function useVoiceTranscriptionToggle({
  owner,
}: UseVoiceTranscriptionToggleProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    isVoiceTranscriptionAllowed(owner)
  );

  const doToggleVoiceTranscription = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
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
    } catch {
      sendNotification({
        type: "error",
        title: t`Failed to update the voice transcription setting`,
        description: t`Could not update the voice transcription setting.`,
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
