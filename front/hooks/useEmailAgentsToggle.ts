import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseEmailAgentsToggleProps {
  owner: LightWorkspaceType;
}

export function useEmailAgentsToggle({ owner }: UseEmailAgentsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowEmailAgents === true
  );

  const doToggleEmailAgents = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowEmailAgents: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Email agents setting");
      }
      setIsEnabled(!isEnabled);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Email agents setting",
        description: "Could not update the Email agents setting.",
      });
    }
    setIsChanging(false);
  };

  return {
    isEnabled,
    isChanging,
    doToggleEmailAgents,
  };
}
