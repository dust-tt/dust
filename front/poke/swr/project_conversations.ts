import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetSpaceConversationsResponseBody,
  PodConversationListItemType,
} from "@app/types/api/assistant/conversation/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeProjectConversationsProps {
  disabled?: boolean;
  limit: number;
  owner: LightWorkspaceType;
  projectId: string;
}

export interface PokeProjectConversationsData {
  conversations: PodConversationListItemType[];
  hasMore: boolean;
  isLoadingMore: boolean;
}

export function usePokeProjectConversations({
  disabled,
  limit,
  owner,
  projectId,
}: UsePokeProjectConversationsProps) {
  const { fetcher } = useFetcher();
  const conversationsFetcher: Fetcher<GetSpaceConversationsResponseBody> =
    fetcher;
  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/projects/${projectId}/conversations?limit=${limit}`,
    conversationsFetcher,
    { disabled, keepPreviousData: true }
  );

  return {
    data: {
      conversations:
        data?.conversations ?? emptyArray<PodConversationListItemType>(),
      hasMore: data?.hasMore ?? false,
      isLoadingMore: isValidating && !!data,
    },
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
