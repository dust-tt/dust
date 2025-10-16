import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeListConversations } from "@app/pages/api/poke/workspaces/[wId]/conversations";
import type { PokeConditionalFetchProps } from "@app/poke/swr/types";

export interface PokeConversationsFetchProps extends PokeConditionalFetchProps {
  agentId?: string;
}

export function usePokeConversations({
  disabled,
  owner,
  agentId,
}: PokeConversationsFetchProps) {
  const conversationsFetcher: Fetcher<PokeListConversations> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    agentId
      ? `/api/poke/workspaces/${owner.sId}/conversations?agentId=${agentId}`
      : null,
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
