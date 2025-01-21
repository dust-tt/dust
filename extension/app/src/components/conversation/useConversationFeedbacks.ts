import { useDustAPI } from "@extension/lib/dust_api";
import { useSWRWithDefaults } from "@extension/lib/swr";
import { useMemo } from "react";

export function useConversationFeedbacks({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const dustAPI = useDustAPI();
  const feedbacksFetcher = async (key: any[]) => {
    const res = await dustAPI.getConversationFeedback(key[2]);
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults(
    ["getConversationFeedbacks", dustAPI.workspaceId(), { conversationId }],
    feedbacksFetcher
  );

  return {
    feedbacks: useMemo(() => data ?? [], [data]),
    isFeedbacksLoading: !error && !data,
    isFeedbacksError: error,
    mutateConversationsFeedbacks: mutate,
  };
}
