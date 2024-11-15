import { logout } from "@extension/lib/auth";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useEffect, useMemo } from "react";

export function useConversations() {
  const dustAPI = useDustAPI();
  const conversationsFetcher = async () => {
    const res = await dustAPI.getConversations();
    if (res.isOk()) {
      return res.value;
    }
    throw new Error(res.error.message);
  };

  const { data, error, mutate } = useSWRWithDefaults(
    ["getConversations", dustAPI.workspaceId()],
    conversationsFetcher
  );

  useEffect(() => {
    if (
      typeof error?.message === "string" &&
      error?.message.includes("User not found")
    ) {
      void logout();
    }
  }, [error]);

  return {
    conversations: useMemo(() => data ?? [], [data]),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}
