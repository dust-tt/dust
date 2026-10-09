import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { areOpenPodsAllowed } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseOpenPodsPolicyProps {
  owner: LightWorkspaceType;
}

export function useOpenPodsPolicy({ owner }: UseOpenPodsPolicyProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        throw await getErrorFromResponse(res);
      }

      setAllowOpenPods(nextValue);
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update Pod visibility policy`,
        error,
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
