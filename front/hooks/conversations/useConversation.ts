import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type {
  ConversationError,
  ConversationWithoutContentType,
} from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
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
  conversationError: ConversationError | null;
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

  const conversation = data?.conversation;

  // Don't count network/connection errors when we already have cached data.
  // This allows u sto keep displaying the conversation instead of replacing it with the error screen.
  // Actual API errors are always surfaced regardless (example: 404 if the spaces were changed and the conversation is
  // no longer accessible to the user).
  const conversationError =
    error && (!conversation || isAPIErrorResponse(error)) ? error : null;

  return {
    conversation,
    isConversationLoading: !error && !data,
    conversationError,
    mutateConversation: mutate,
  };
}
