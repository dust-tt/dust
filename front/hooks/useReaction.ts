import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { useSubmitFunction } from "@app/lib/client/utils";
import { clientFetch } from "@app/lib/egress/client";
import { useUser } from "@app/lib/swr/user";

export function useReaction({
  owner,
  conversationId,
  message,
}: {
  owner: { sId: string };
  conversationId: string;
  message: VirtuosoMessage;
}) {
  const { user } = useUser();

  const { submit: onReactionToggle } = useSubmitFunction(
    async ({ emoji }: { emoji: string }) => {
      if (!isUserMessage(message) && !isMessageTemporayState(message)) {
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
