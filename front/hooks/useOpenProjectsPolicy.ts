import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseOpenProjectsPolicyProps {
  owner: LightWorkspaceType;
}

export function useOpenProjectsPolicy({ owner }: UseOpenProjectsPolicyProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [allowOpenProjects, setAllowOpenProjects] = useState(
    owner.metadata?.allowOpenProjects !== false
  );

  const doUpdateOpenProjectsPolicy = async (nextValue: boolean) => {
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
        throw new Error("Failed to update project visibility policy.");
      }

      setAllowOpenProjects(nextValue);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update project visibility policy",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }

    return true;
  };

  return {
    allowOpenProjects,
    isChanging,
    doUpdateOpenProjectsPolicy,
  };
}
