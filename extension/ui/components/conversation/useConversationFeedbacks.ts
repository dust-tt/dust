import { useDustAPI } from "@app/shared/lib/dust_api";
import type { AgentMessageFeedbackType } from "@app/shared/lib/feedbacks";
import { useSWRWithDefaults } from "@app/shared/lib/swr";
import { useMemo } from "react";

type FeedbacksKey =
  | ["getConversationFeedbacks", string, { conversationId: string }]
  | null;

export function useConversationFeedbacks({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const dustAPI = useDustAPI();
  const feedbacksFetcher = async (key: FeedbacksKey) => {
    if (!key) {
      return null;
    }

    const res = await dustAPI.getConversationFeedback(key[2]);
    if (res.isOk()) {
      return res.value;
    }
    throw res.error;
  };

  const { data, error, mutate } = useSWRWithDefaults<
    FeedbacksKey,
    AgentMessageFeedbackType[] | null
  >(
    conversationId
      ? ["getConversationFeedbacks", dustAPI.workspaceId(), { conversationId }]
      : null,
    feedbacksFetcher
  );

  return {
    feedbacks: useMemo(() => data ?? [], [data]),
    isFeedbacksLoading: !error && !data,
    isFeedbacksError: error,
    mutateConversationsFeedbacks: mutate,
  };
}
