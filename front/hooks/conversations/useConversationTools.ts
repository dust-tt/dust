import type { FetchConversationToolsResponse } from "@app/lib/api/assistant/conversation/tools";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversationTools({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const { fetcher } = useFetcher();
  const conversationToolsFetcher: Fetcher<FetchConversationToolsResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`
      : null,
    conversationToolsFetcher,
    { ...options, focusThrottleInterval: 30 * 60 * 1000 } // 30 minutes
  );

  return {
    conversationTools: useMemo(
      () =>
        data
          ? data.tools
          : emptyArray<FetchConversationToolsResponse["tools"][number]>(),
      [data]
    ),
    isConversationToolsLoading: !error && !data,
    isConversationToolsError: error,
    mutateConversationTools: mutate,
  };
}
