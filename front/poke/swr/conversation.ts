import type {
  PokeListConversationItem,
  PokeListConversations,
} from "@app/lib/api/poke/conversations";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";
import type { Fetcher } from "swr";

export interface PokeConversationsFetchProps extends PokeConditionalFetchProps {
  triggerId?: string;
  reinforcedSkillId?: string;
}

export function usePokeConversations({
  disabled,
  owner,
  triggerId,
  reinforcedSkillId,
}: PokeConversationsFetchProps) {
  const { fetcher } = useFetcher();
  const conversationsFetcher: Fetcher<PokeListConversations> = fetcher;

  let url: string | null = null;
  if (reinforcedSkillId) {
    url = `/api/poke/workspaces/${owner.sId}/conversations?reinforcedSkillId=${reinforcedSkillId}`;
  } else if (triggerId) {
    url = `/api/poke/workspaces/${owner.sId}/conversations?triggerId=${triggerId}`;
  }

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    conversationsFetcher,
    { disabled }
  );

  return {
    data: data?.conversations ?? emptyArray<PokeListConversationItem>(),
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}

interface UsePokeAgentConversationsProps extends PokeConditionalFetchProps {
  agentId: string;
  limit: number;
}

export function usePokeAgentConversations({
  agentId,
  disabled,
  limit,
  owner,
}: UsePokeAgentConversationsProps) {
  const { fetcher } = useFetcher();
  const conversationsFetcher: Fetcher<PokeListConversations> = fetcher;

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/conversations?agentId=${agentId}&limit=${limit}`,
    conversationsFetcher,
    { disabled, keepPreviousData: true }
  );

  return {
    data: {
      conversations:
        data?.conversations ?? emptyArray<PokeListConversationItem>(),
      hasMore: data?.hasMore ?? false,
      isLoadingMore: isValidating && !!data,
    },
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
