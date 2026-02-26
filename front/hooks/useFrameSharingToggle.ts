import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useEffect, useState } from "react";

interface UseFrameSharingToggleProps {
  owner: LightWorkspaceType;
}

export function useFrameSharingToggle({ owner }: UseFrameSharingToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowContentCreationFileSharing !== false
  );
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();

  useEffect(() => {
    setIsEnabled(owner.metadata?.allowContentCreationFileSharing !== false);
  }, [owner.metadata?.allowContentCreationFileSharing]);

  const doToggleInteractiveContentSharing = async () => {
    setIsChanging(true);
    try {
      await fetcherWithBody([
        `/api/w/${owner.sId}`,
        {
          allowContentCreationFileSharing: !isEnabled,
        },
        "POST",
      ]);

      setIsChanging(false);
      setIsEnabled((prev) => !prev);
    } catch {
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
    doToggleInteractiveContentSharing,
  };
}
