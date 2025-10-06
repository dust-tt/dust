import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";

interface UseContentCreationSharingToggleProps {
  owner: LightWorkspaceType;
}

export function useContentCreationSharingToggle({
  owner,
}: UseContentCreationSharingToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();

  const isEnabled = owner.metadata?.allowContentCreationFileSharing !== false;

  const doToggleContentCreationSharing = async () => {
    setIsChanging(true);
    try {
      const res = await fetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowContentCreationFileSharing: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Frame sharing setting");
      }

      window.location.reload();
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Frame sharing setting",
        description: "Could not update the Frame file sharing setting.",
      });
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doToggleContentCreationSharing,
  };
}
