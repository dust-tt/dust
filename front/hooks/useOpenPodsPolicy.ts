import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseOpenPodsPolicyProps {
  owner: LightWorkspaceType;
}

export function useOpenPodsPolicy({ owner }: UseOpenPodsPolicyProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [allowOpenPods, setAllowOpenPods] = useState(areOpenPodsAllowed(owner));

  const doUpdateOpenPodsPolicy = async (nextValue: boolean) => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowOpenProjects: nextValue,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Pod visibility policy.");
      }

      setAllowOpenPods(nextValue);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Pod visibility policy",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }

    return true;
  };

  return {
    allowOpenPods,
    isChanging,
    doUpdateOpenPodsPolicy,
  };
}
