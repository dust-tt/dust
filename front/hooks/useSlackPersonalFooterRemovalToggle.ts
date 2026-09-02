import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isSlackPersonalFooterRemovalAllowed } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseSlackPersonalFooterRemovalToggleProps {
  owner: LightWorkspaceType;
}

export function useSlackPersonalFooterRemovalToggle({
  owner,
}: UseSlackPersonalFooterRemovalToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    isSlackPersonalFooterRemovalAllowed(owner)
  );

  const doToggleSlackPersonalFooterRemoval = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          slackPersonalAllowFooterRemoval: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Slack footer removal setting");
      }

      setIsEnabled(!isEnabled);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Slack footer removal setting",
        description: "Could not update the Slack footer removal setting.",
      });
    }
    setIsChanging(false);
  };

  return {
    isEnabled,
    isChanging,
    doToggleSlackPersonalFooterRemoval,
  };
}
