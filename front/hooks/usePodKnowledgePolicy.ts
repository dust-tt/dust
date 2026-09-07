import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { isManualPodFilesManagementAllowed } from "@app/lib/workspace_policies";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UsePodKnowledgePolicyProps {
  owner: LightWorkspaceType;
}

export function usePodKnowledgePolicy({ owner }: UsePodKnowledgePolicyProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [
    allowManualPodKnowledgeManagement,
    setAllowManualPodKnowledgeManagement,
  ] = useState(isManualPodFilesManagementAllowed(owner));

  const doUpdatePodKnowledgePolicy = async (nextValue: boolean) => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowManualProjectKnowledgeManagement: nextValue,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to update Pod knowledge policy.");
      }

      setAllowManualPodKnowledgeManagement(nextValue);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update Pod knowledge policy",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }

    return true;
  };

  return {
    allowManualPodKnowledgeManagement,
    isChanging,
    doUpdatePodKnowledgePolicy,
  };
}
