import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseReinforcementToggleProps {
  owner: LightWorkspaceType;
}

export function useReinforcementToggle({ owner }: UseReinforcementToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.allowReinforcement !== false
  );

  const doToggleReinforcement = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowReinforcement: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update agent reinforcement setting");
      }
      setIsEnabled(!isEnabled);
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update agent reinforcement setting",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doToggleReinforcement,
  };
}
