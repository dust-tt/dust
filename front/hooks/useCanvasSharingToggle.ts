import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { WorkspaceType } from "@app/types";

export function useCanvasSharingToggle({ owner }: { owner: WorkspaceType }) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();

  const isEnabled = owner.metadata?.allowCanvasFileSharing !== false;

  const toggleCanvasSharing = async () => {
    setIsChanging(true);
    try {
      const res = await fetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowCanvasFileSharing: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update canvas sharing setting");
      }

      window.location.reload();
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update canvas sharing setting",
        description: "Could not update the canvas file sharing setting.",
      });
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    toggleCanvasSharing,
  };
}
