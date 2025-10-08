import { useEffect, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";

interface UseContentCreationSharingToggleProps {
  owner: LightWorkspaceType;
}

export function useContentCreationSharingToggle({
  owner,
}: UseContentCreationSharingToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowContentCreationFileSharing !== false
  );
  const sendNotification = useSendNotification();

  useEffect(() => {
    setIsEnabled(owner.metadata?.allowContentCreationFileSharing !== false);
  }, [owner.metadata?.allowContentCreationFileSharing]);

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

      setIsChanging(false);
      setIsEnabled((prev) => !prev);
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
