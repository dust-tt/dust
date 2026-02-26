import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { useFetcher } from "@app/lib/swr/swr";

export function useReaction({
  owner,
  conversationId,
  message,
}: {
  owner: { sId: string };
  conversationId?: string | null;
  message: VirtuosoMessage;
}) {
  const { user } = useAuth();
  const { fetcherWithBody } = useFetcher();

  const { submit: onReactionToggle } = useSubmitFunction(
    async ({ emoji }: { emoji: string }) => {
      if (!isUserMessage(message) && !isMessageTemporayState(message)) {
        return;
      }

      if (!conversationId) {
        return;
      }

      const currentReactions =
        isUserMessage(message) || isMessageTemporayState(message)
          ? (message.reactions ?? [])
          : [];

      const hasReacted = currentReactions.some(
        (r) => r.emoji === emoji && r.users.some((u) => u.userId === user?.sId)
      );

      await fetcherWithBody([
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/reactions`,
        { reaction: emoji },
        hasReacted ? "DELETE" : "POST",
      ]);
    }
  );

  return {
    onReactionToggle,
  };
}
