import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

export function useFeedbackConversationContext({
  workspaceId,
  feedbackId,
}: {
  feedbackId: string;
  workspaceId: string;
}) {
  const feedbackFetcher: Fetcher<{
    conversationId: string;
    messageId: string;
  }> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/feedbacks/${feedbackId}/conversation-context`,
    feedbackFetcher
  );

  return {
    conversationContext: data ? data : null,
    isLoading: !error && !data,
    isError: error,
  };
}
