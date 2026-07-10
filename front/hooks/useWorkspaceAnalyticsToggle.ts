import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { isWorkspaceAnalyticsEnabled } from "@app/types/user";
import { useState } from "react";

interface UseWorkspaceAnalyticsToggleProps {
  owner: LightWorkspaceType;
}

export function useWorkspaceAnalyticsToggle({
  owner,
}: UseWorkspaceAnalyticsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    isWorkspaceAnalyticsEnabled(owner)
  );

  const doToggleWorkspaceAnalytics = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          disableWorkspaceAnalytics: isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Workspace Analyst setting");
      }
      setIsEnabled(!isEnabled);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Workspace Analyst setting",
        description: "Could not update the Workspace Analyst setting.",
      });
    }
    setIsChanging(false);
  };

  return {
    isEnabled,
    isChanging,
    doToggleWorkspaceAnalytics,
  };
}
