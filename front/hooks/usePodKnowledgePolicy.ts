import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { isManualPodFilesManagementAllowed } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UsePodKnowledgePolicyProps {
  owner: LightWorkspaceType;
}

export function usePodKnowledgePolicy({ owner }: UsePodKnowledgePolicyProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        throw await getErrorFromResponse(res);
      }

      setAllowManualPodKnowledgeManagement(nextValue);
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update Pod knowledge policy`,
        error,
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
