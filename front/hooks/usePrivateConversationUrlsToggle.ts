import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { useState } from "react";

interface UsePrivateConversationUrlsToggleProps {
  owner: LightWorkspaceType;
}

export function usePrivateConversationUrlsToggle({
  owner,
}: UsePrivateConversationUrlsToggleProps) {
  const [isChanging, setIsChanging] = useState(false);
  const sendNotification = useSendNotification();
  const [isEnabled, setIsEnabled] = useState(
    owner.metadata?.privateConversationUrlsByDefault === true
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
        throw new Error("Failed to update private conversation URLs setting");
      }

      setIsEnabled(!isEnabled);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to update private conversation URLs setting",
        description: normalizeError(error).message,
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
