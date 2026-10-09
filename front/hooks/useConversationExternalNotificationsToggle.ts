import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { useAuthContext } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types/user";
import { areConversationExternalNotificationsEnabled } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UseConversationExternalNotificationsToggleProps {
  owner: LightWorkspaceType;
}

export function useConversationExternalNotificationsToggle({
  owner,
}: UseConversationExternalNotificationsToggleProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
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
        throw await getErrorFromResponse(res);
      }
      await mutateAuthContext();
      return true;
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update conversation email and Slack notifications`,
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
    doToggleConversationExternalNotifications,
  };
}
