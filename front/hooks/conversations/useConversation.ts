import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type {
  ConversationError,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import type { Fetcher } from "swr";

export function useConversation({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId?: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}): {
  conversation?: ConversationWithoutContentType;
  isConversationLoading: boolean;
  conversationError: ConversationError;
  mutateConversation: ReturnType<
    typeof useSWRWithDefaults<string, GetConversationResponseBody>
  >["mutate"];
} {
  const { fetcher } = useFetcher();
  const conversationFetcher: Fetcher<GetConversationResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}`
      : null,
    conversationFetcher,
    options
  );

  return {
    conversation: data ? data.conversation : undefined,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}
