import { useSendApiErrorNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { arePrivateConversationUrlsDefault } from "@app/lib/workspace_policies";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface UsePrivateConversationUrlsToggleProps {
  owner: LightWorkspaceType;
}

export function usePrivateConversationUrlsToggle({
  owner,
}: UsePrivateConversationUrlsToggleProps) {
  const { t } = useLingui();
  const [isChanging, setIsChanging] = useState(false);
  const sendApiErrorNotification = useSendApiErrorNotification();
  const [isEnabled, setIsEnabled] = useState(
    arePrivateConversationUrlsDefault(owner)
  );

  const doTogglePrivateConversationUrls = async () => {
    setIsChanging(true);
    try {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          privateConversationUrlsByDefault: !isEnabled,
        }),
      });

      if (!res.ok) {
        throw await getErrorFromResponse(res);
      }

      setIsEnabled(!isEnabled);
    } catch (error) {
      sendApiErrorNotification({
        title: t`Failed to update the private conversation URLs setting`,
        error,
      });
    } finally {
      setIsChanging(false);
    }
  };

  return {
    isEnabled,
    isChanging,
    doTogglePrivateConversationUrls,
  };
}
