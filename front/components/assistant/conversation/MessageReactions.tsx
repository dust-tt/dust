import { useUser } from "@app/lib/swr/user";
import type { MessageReactionType } from "@app/types";

import { ReactionPill } from "./ReactionPill";

interface MessageReactionsProps {
  reactions: MessageReactionType[];
  onReactionClick: (emoji: string) => void;
}

export function MessageReactions({
  reactions,
  onReactionClick,
}: MessageReactionsProps) {
  const { user } = useUser();

  if (reactions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {reactions.map((reaction) => {
        const isCurrentUserReacted = reaction.users.some(
          (u) => u.userId === user?.sId
        );

        return (
          <ReactionPill
            key={reaction.emoji}
            emoji={reaction.emoji}
            count={reaction.users.length}
            users={reaction.users}
            hasCurrentUserReacted={isCurrentUserReacted}
            onClick={() => onReactionClick(reaction.emoji)}
          />
        );
      })}
    </div>
  );
}
