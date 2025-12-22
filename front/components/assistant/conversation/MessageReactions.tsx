import type { MessageReactionType } from "@app/types";

import { ReactionPill } from "./ReactionPill";

interface MessageReactionsProps {
  reactions: MessageReactionType[];
  currentUserId: string;
  onReactionClick: (emoji: string) => void;
}

export function MessageReactions({
  reactions,
  currentUserId,
  onReactionClick,
}: MessageReactionsProps) {
  if (reactions.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {reactions.map((reaction) => {
        const isCurrentUserReacted = reaction.users.some(
          (u) => u.userId === currentUserId
        );

        return (
          <ReactionPill
            key={reaction.emoji}
            emoji={reaction.emoji}
            count={reaction.users.length}
            users={reaction.users}
            isCurrentUserReacted={isCurrentUserReacted}
            onClick={() => onReactionClick(reaction.emoji)}
          />
        );
      })}
    </div>
  );
}
