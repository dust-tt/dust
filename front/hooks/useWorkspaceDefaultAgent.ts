import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAuthContext } from "@app/lib/swr/workspaces";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  getWorkspaceDefaultAgentId,
  type LightWorkspaceType,
} from "@app/types/user";
import { useState } from "react";

interface UseWorkspaceDefaultAgentProps {
  owner: LightWorkspaceType;
}

export function useWorkspaceDefaultAgent({
  owner,
}: UseWorkspaceDefaultAgentProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
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
        let description = "Failed to update the workspace default agent.";
        try {
          const body = await res.json();
          if (body?.error?.message) {
            description = body.error.message;
          }
        } catch {
          // JSON parse failure — keep fallback.
        }
        sendNotification({
          type: "error",
          title: "Failed to update the workspace default agent",
          description,
        });
        return false;
      }

      // Revalidation is best-effort; failure does not mean the update failed.
      await mutateAuthContext().catch(() => {
        // Non-critical — the update succeeded. Context will sync on next navigation.
      });
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update the workspace default agent",
        description: normalizeError(error).message,
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
