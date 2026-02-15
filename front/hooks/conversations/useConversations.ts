import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type { Fetcher } from "swr";

export function useConversations({
  workspaceId,
  options,
}: {
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationFetcher: Fetcher<GetConversationsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations`,
    conversationFetcher,
    options
  );

  return {
    conversations: data?.conversations ?? emptyArray(),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}
