import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UseProjectKnowledgePolicyProps {
  owner: LightWorkspaceType;
}

export function useProjectKnowledgePolicy({
  owner,
}: UseProjectKnowledgePolicyProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [
    allowManualProjectKnowledgeManagement,
    setAllowManualProjectKnowledgeManagement,
  ] = useState(owner.metadata?.allowManualProjectKnowledgeManagement !== false);

  const doUpdateProjectKnowledgePolicy = async (nextValue: boolean) => {
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
        throw new Error("Failed to update project knowledge policy.");
      }

      setAllowManualProjectKnowledgeManagement(nextValue);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update project knowledge policy",
        description: normalizeError(error).message,
      });
      return false;
    } finally {
      setIsChanging(false);
    }

    return true;
  };

  return {
    allowManualProjectKnowledgeManagement,
    isChanging,
    doUpdateProjectKnowledgePolicy,
  };
}
