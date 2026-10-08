import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useAuthContext } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types/user";
import { getWorkspaceDefaultAgentId } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseWorkspaceDefaultAgentProps {
  owner: LightWorkspaceType;
}

export function useWorkspaceDefaultAgent({
  owner,
}: UseWorkspaceDefaultAgentProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
  const { mutateAuthContext } = useAuthContext({ workspaceId: owner.sId });

  const workspaceDefaultAgentId = getWorkspaceDefaultAgentId(owner);

  const doUpdateWorkspaceDefaultAgent = async (
    agentId: string | null
  ): Promise<boolean> => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspaceDefaultAgentId: agentId,
        }),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendApiErrorNotification({
          title: t`Failed to update the workspace default agent`,
          error: errorData,
        });
        return false;
      }

      // Revalidation is best-effort; failure does not mean the update failed.
      await mutateAuthContext().catch(() => {
        // Non-critical — the update succeeded. Context will sync on next navigation.
      });
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update the workspace default agent`,
        error,
      });
      return false;
    } finally {
      setIsChanging(false);
    }

    return true;
  };

  return {
    workspaceDefaultAgentId,
    isChanging,
    doUpdateWorkspaceDefaultAgent,
  };
}
