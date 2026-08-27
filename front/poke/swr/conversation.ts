import type {
  PokeListConversationItem,
  PokeListConversations,
} from "@app/lib/api/poke/conversations";
import type { AgentConversationsOrderColumn } from "@app/lib/resources/conversation_resource";
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
  offset: number;
  orderColumn: AgentConversationsOrderColumn;
  orderDirection: "asc" | "desc";
  // Inclusive `createdAt` day bounds, as YYYY-MM-DD.
  from?: string;
  to?: string;
}

export function usePokeAgentConversations({
  agentId,
  disabled,
  from,
  limit,
  offset,
  orderColumn,
  orderDirection,
  owner,
  to,
}: UsePokeAgentConversationsProps) {
  const { fetcher } = useFetcher();
  const conversationsFetcher: Fetcher<PokeListConversations> = fetcher;

  const params = new URLSearchParams({
    agentId,
    limit: limit.toString(),
    offset: offset.toString(),
    orderColumn,
    orderDirection,
  });
  if (from) {
    params.set("from", from);
  }
  if (to) {
    params.set("to", to);
  }

  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/conversations?${params.toString()}`,
    conversationsFetcher,
    { disabled, keepPreviousData: true }
  );

  return {
    data: {
      conversations:
        data?.conversations ?? emptyArray<PokeListConversationItem>(),
      totalCount: data?.totalCount ?? 0,
      isValidating: isValidating && !!data,
    },
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
