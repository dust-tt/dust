import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";

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

      await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${message.sId}/reactions`,
        {
          method: hasReacted ? "DELETE" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ reaction: emoji }),
        }
      );
    }
  );

  return {
    onReactionToggle,
  };
}
