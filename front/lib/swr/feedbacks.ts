import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";

export function useFeedbackConversation({
  workspaceId,
  feedbackId,
}: {
  feedbackId: string;
  workspaceId: string;
}) {
  const feedbackFetcher: Fetcher<{
    conversationId: string;
  }> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/feedbacks/${feedbackId}/conversation`,
    feedbackFetcher
  );

  return {
    conversationId: data ? data.conversationId : null,
    isLoading: !error && !data,
    isError: error,
  };
}
