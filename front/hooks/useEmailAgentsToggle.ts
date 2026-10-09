import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { areEmailAgentsAllowed } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseEmailAgentsToggleProps {
  owner: LightWorkspaceType;
}

export function useEmailAgentsToggle({ owner }: UseEmailAgentsToggleProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
  const [isEnabled, setIsEnabled] = useState(areEmailAgentsAllowed(owner));

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
        throw await getErrorFromResponse(res);
      }
      setIsEnabled(!isEnabled);
      return true;
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update the email agents setting`,
        error,
      });
      return false;
    } finally {
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doToggleEmailAgents,
  };
}
