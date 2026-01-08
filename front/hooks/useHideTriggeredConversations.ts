import { useCallback } from "react";

import { useUserMetadata } from "@app/lib/swr/user";
import { setUserMetadataFromClient } from "@app/lib/user";

const HIDE_TRIGGERED_CONVERSATIONS_KEY = "hideTriggeredConversations";

export const useHideTriggeredConversations = () => {
  const { metadata, isMetadataLoading, isMetadataError, mutateMetadata } =
    useUserMetadata(HIDE_TRIGGERED_CONVERSATIONS_KEY);

  const hideTriggeredConversations = metadata?.value === "true";

  const setHideTriggeredConversations = useCallback(
    async (hide: boolean) => {
      await setUserMetadataFromClient({
        key: HIDE_TRIGGERED_CONVERSATIONS_KEY,
        value: hide ? "true" : "false",
      });
      void mutateMetadata();
    },
    [mutateMetadata]
  );

  return {
    hideTriggeredConversations,
    setHideTriggeredConversations,
    isLoading: isMetadataLoading,
    isError: isMetadataError,
  };
};
