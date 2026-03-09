import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { PokeGetConversationConfig } from "@app/pages/api/poke/workspaces/[wId]/conversations/[cId]/config";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeConversationConfigProps {
  disabled?: boolean;
  owner: LightWorkspaceType;
  conversationId: string;
}

export function usePokeConversationConfig({
  disabled,
  owner,
  conversationId,
}: UsePokeConversationConfigProps) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<PokeGetConversationConfig> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/config`,
    configFetcher,
    { disabled }
  );

  return {
    data: data ?? null,
    isLoading: !error && !data && !disabled,
    isError: error,
    mutate,
  };
}
