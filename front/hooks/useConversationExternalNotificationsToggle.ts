import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAuthContext } from "@app/lib/swr/workspaces";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { areConversationExternalNotificationsEnabled } from "@app/types/user";
import { useState } from "react";

interface UseConversationExternalNotificationsToggleProps {
  owner: LightWorkspaceType;
}

export function useConversationExternalNotificationsToggle({
  owner,
}: UseConversationExternalNotificationsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const { mutateAuthContext } = useAuthContext({
    workspaceId: owner.sId,
    disabled: true,
  });
  const isEnabled = areConversationExternalNotificationsEnabled(owner);

  const doToggleConversationExternalNotifications = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          allowConversationExternalNotifications: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error(
          "Failed to update conversation email and Slack notifications setting"
        );
      }
      await mutateAuthContext();
      return true;
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update conversation email and Slack notifications",
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
    doToggleConversationExternalNotifications,
  };
}
