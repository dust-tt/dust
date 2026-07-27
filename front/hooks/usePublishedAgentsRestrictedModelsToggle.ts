import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { areRestrictedModelsAllowedForPublishedAgents } from "@app/types/user";
import { useState } from "react";

interface UsePublishedAgentsRestrictedModelsToggleProps {
  owner: LightWorkspaceType;
}

export function usePublishedAgentsRestrictedModelsToggle({
  owner,
}: UsePublishedAgentsRestrictedModelsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    areRestrictedModelsAllowedForPublishedAgents(owner)
  );

  const doTogglePublishedAgentsRestrictedModels = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowRestrictedModelsForPublishedAgents: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update published agents setting");
      }
      setIsEnabled(!isEnabled);
    } catch {
      sendNotification({
        type: "error",
        title: "Failed to update published agents setting",
        description:
          "Could not update the published agents model access setting.",
      });
    }
    setIsChanging(false);
  };

  return {
    isEnabled,
    isChanging,
    doTogglePublishedAgentsRestrictedModels,
  };
}
