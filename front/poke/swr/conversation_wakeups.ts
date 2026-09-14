import type { PokeListConversationWakeUps } from "@app/lib/api/poke/conversations";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeConversationWakeUpsProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  conversationId: string;
}

export function usePokeConversationWakeUps({
  disabled,
  owner,
  conversationId,
}: UsePokeConversationWakeUpsProps) {
  const { fetcher } = useFetcher();
  const wakeUpsFetcher: Fetcher<PokeListConversationWakeUps> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/wakeups`,
    wakeUpsFetcher,
    { disabled }
  );

  return {
    wakeUps: data?.wakeUps ?? emptyArray(),
    isWakeUpsLoading: !error && !data && !disabled,
    isWakeUpsError: error,
    mutate,
  };
}
