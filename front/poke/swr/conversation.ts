import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListConversations } from "@app/pages/api/poke/workspaces/[wId]/conversations";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export interface PokeConversationsFetchProps extends PokeConditionalFetchProps {
  agentId?: string;
  triggerId?: string;
}

export function usePokeConversations({
  disabled,
  owner,
  agentId,
  triggerId,
}: PokeConversationsFetchProps) {
  const conversationsFetcher: Fetcher<PokeListConversations> = fetcher;

  let url: string | null = null;
  if (agentId) {
    url = `/api/poke/workspaces/${owner.sId}/conversations?agentId=${agentId}`;
  } else if (triggerId) {
    url = `/api/poke/workspaces/${owner.sId}/conversations?triggerId=${triggerId}`;
  }

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    conversationsFetcher,
    { disabled }
  );

  return {
    data: data?.conversations ?? [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  };
}
