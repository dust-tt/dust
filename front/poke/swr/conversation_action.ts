import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { FetchConversationMessageActionResponse } from "@app/types/api/assistant/messages";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

interface UsePokeConversationActionProps {
  actionId: string;
  conversationId: string;
  disabled: boolean;
  messageId: string;
  owner: LightWorkspaceType;
}

export function usePokeConversationAction({
  actionId,
  conversationId,
  disabled,
  messageId,
  owner,
}: UsePokeConversationActionProps) {
  const { fetcher } = useFetcher();
  const actionFetcher: Fetcher<FetchConversationMessageActionResponse> =
    fetcher;
  const { data, error, isValidating, mutate } = useSWRWithDefaults(
    `/api/poke/workspaces/${owner.sId}/conversations/${conversationId}/messages/${messageId}/actions/${actionId}`,
    actionFetcher,
    { disabled }
  );

  return {
    action: data?.action ?? null,
    isError: error,
    isLoading: isValidating && !data && !disabled,
    retry: mutate,
  };
}
