import { useAuthErrorCheck } from "@extension/hooks/useAuthErrorCheck";
import {} from "@extension/lib/auth";
import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useMemo } from "react";

export function useConversations() {
  const dustAPI = useDustAPI();
  const conversationsFetcher = async () => {
    const res = await dustAPI.getConversations();
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults(
    ["getConversations", dustAPI.workspaceId()],
    conversationsFetcher
  );

  useAuthErrorCheck(error, mutate);

  return {
    conversations: useMemo(() => data ?? [], [data]),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}
