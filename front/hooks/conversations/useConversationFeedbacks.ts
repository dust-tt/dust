import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function useConversationFeedbacks({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId: string;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const { fetcher } = useFetcher();
  const conversationFeedbacksFetcher: Fetcher<{
    feedbacks: AgentMessageFeedbackType[];
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/feedbacks`,
    conversationFeedbacksFetcher,
    {
      focusThrottleInterval: 30 * 60 * 1000, // 30 minutes
      ...options,
    }
  );

  return {
    feedbacks: data?.feedbacks ?? emptyArray(),
    isFeedbacksLoading: !error && !data,
    isFeedbacksError: error,
    mutateReactions: mutate,
  };
}
