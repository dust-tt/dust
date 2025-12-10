import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetBlockedActionsResponseType } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/actions/blocked";

export function useBlockedActions({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const blockedActionsFetcher: Fetcher<GetBlockedActionsResponseType> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/actions/blocked`
      : null,
    blockedActionsFetcher,
    { disabled: conversationId === null }
  );

  return {
    blockedActions: data?.blockedActions ?? emptyArray(),
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
