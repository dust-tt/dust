import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationContextUsageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/context-usage";
import type { Fetcher } from "swr";

export function useConversationContextUsage({
  conversationId,
  workspaceId,
}: {
  conversationId?: string | null;
  workspaceId: string;
}) {
  const { fetcher } = useFetcher();
  const contextUsageFetcher: Fetcher<GetConversationContextUsageResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/context-usage`
      : null,
    contextUsageFetcher
  );

  return {
    contextUsage: data ?? null,
    isContextUsageLoading: !error && !data,
    isContextUsageError: error,
    mutateContextUsage: mutate,
  };
}
