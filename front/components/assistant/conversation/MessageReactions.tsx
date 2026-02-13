import { useAuth } from "@app/lib/auth/AuthContext";
import type { MessageReactionType } from "@app/types/assistant/conversation";
import { Button, Tooltip } from "@dust-tt/sparkle";

import { ReactionPill } from "./ReactionPill";

interface MessageReactionsProps {
  reactions: MessageReactionType[];
  onReactionClick: (emoji: string) => void;
}

const MAX_VISIBLE_REACTIONS = 3;

export function MessageReactions({
  reactions,
  onReactionClick,
}: MessageReactionsProps) {
  const { user } = useAuth();

  if (reactions.length === 0) {
    return null;
  }

  const visibleReactions = reactions.slice(0, MAX_VISIBLE_REACTIONS);
  const hiddenReactions = reactions.slice(MAX_VISIBLE_REACTIONS);
  const hasMoreReactions = hiddenReactions.length > 0;

  return (
    <>
      {visibleReactions.map((reaction) => {
        const hasCurrentUserReacted = reaction.users.some(
          (u) => u.userId === user?.sId
        );

        return (
          <ReactionPill
            key={reaction.emoji}
            emoji={reaction.emoji}
            count={reaction.users.length}
            users={reaction.users}
            hasCurrentUserReacted={hasCurrentUserReacted}
            onClick={() => onReactionClick(reaction.emoji)}
          />
        );
      })}
      {hasMoreReactions && (
        <Tooltip
          label={
            <div className="flex flex-col gap-1">
              {hiddenReactions.map((reaction) => (
                <div key={reaction.emoji} className="flex items-center gap-1">
                  <span>{reaction.emoji}</span>
                  <span className="text-xs">
                    {reaction.users
                      .map((u) => u.fullName ?? u.username)
                      .join(", ")}
                  </span>
                </div>
              ))}
            </div>
          }
          side="top"
          trigger={
            <Button
              label={`+${hiddenReactions.length}`}
              size="xmini"
              variant="outline"
              aria-label="More reactions"
            />
          }
        />
      )}
    </>
  );
}
