import { AnimatedText } from "@sparkle/components/AnimatedText";
import { Avatar } from "@sparkle/components/Avatar";
import { ListItem } from "@sparkle/components/ListItem";
import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

export interface ReplySectionProps {
  replyCount: number;
  unreadCount: number;
  mentionCount?: number;
  /** Participant avatars shown as a stacked Avatar.Stack (up to 3 visible). */
  avatars: Array<{
    name?: string;
    emoji?: string;
    visual?: string | React.ReactNode;
    isRounded?: boolean;
    backgroundColor?: string;
  }>;
  /** Name of the author of the last message ("Last by X."). */
  lastMessageBy: string;
}

/** Summary line of reply, unread, and mention counts with participant avatars, for the replySection slot of ConversationListItem. */
export function ReplySection({
  replyCount,
  unreadCount,
  mentionCount = 0,
  avatars,
  lastMessageBy,
}: ReplySectionProps) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {replyCount > 0 && (
        <Avatar.Stack
          avatars={avatars}
          nbVisibleItems={3}
          onTop={"first" as const}
          size="xs"
        />
      )}
      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {mentionCount > 0 ? (
          <>
            <span className="heading-xs text-highlight">
              {mentionCount} {mentionCount === 1 ? "Mention" : "Mentions"}
            </span>
            {unreadCount !== mentionCount && (
              <span className="heading-xs  text-highlight">
                {" "}
                in {unreadCount} {unreadCount === 1 ? "unread" : "unreads"}
              </span>
            )}
            {replyCount !== unreadCount && (
              <span className="heading-xs">
                {" "}
                ({replyCount} {replyCount === 1 ? "reply" : "replies"})
              </span>
            )}
          </>
        ) : unreadCount === 0 ? (
          <span className="heading-xs">
            {replyCount} {replyCount === 1 ? "Reply" : "Replies"}
          </span>
        ) : unreadCount === replyCount ? (
          <span className="heading-xs text-highlight">
            {unreadCount} Unread
          </span>
        ) : (
          <>
            <span className="heading-xs text-highlight">
              {unreadCount} Unread
            </span>
            {replyCount > 0 && (
              <span className="heading-xs">
                {" "}
                ({replyCount} {replyCount === 1 ? "reply" : "replies"}).
              </span>
            )}
          </>
        )}{" "}
        {replyCount > 0 && (
          <>
            Last by <span className="heading-xs">{lastMessageBy}</span>.
          </>
        )}
      </div>
    </div>
  );
}

export interface ConversationListItemProps {
  /** Marks the row as unread: shows a highlight dot and colors the timestamp. */
  unread: boolean;
  /** The conversation to summarise (title, optional description, last update). */
  conversation: {
    id: string;
    title: string;
    description?: string;
    updatedAt: Date;
  };
  /** Leading avatar for direct conversations — pass either this or creator, not both. */
  avatar?: {
    name?: string;
    emoji?: string;
    visual?: string | React.ReactNode;
    isRounded?: boolean;
    backgroundColor?: string;
  };
  /** Creator portrait and name for group conversations — pass either this or avatar, not both. */
  creator?: {
    fullName: string;
    portrait?: string;
  };
  /** Formatted timestamp displayed on the right of the title. */
  time: string;
  /** Slot for reply/unread/mention counts — use the ReplySection component. */
  replySection?: ReactNode;
  /** Called when the row is clicked (e.g. to open the thread). */
  onClick?: () => void;
  /** Briefly flashes a highlight background on the row when it becomes true. */
  showFocus?: boolean;
  /** "streaming" animates the title and description as if being generated. */
  textAnimation?: "none" | "streaming";
  className?: string;
}

/**
 * A list row summarising a conversation: title and description, a timestamp,
 * and a leading avatar (direct) or creator portrait (group), with an optional
 * replySection for reply/unread/mention counts. Use it to render an inbox or
 * activity feed of conversations, grouping rows inside ListGroup so dividers
 * and spacing stay consistent.
 * @summary Conversation summary row for inbox lists.
 */
export function ConversationListItem({
  conversation,
  unread,
  avatar,
  creator,
  time,
  replySection,
  onClick,
  showFocus = false,
  textAnimation = "none",
  className,
}: ConversationListItemProps) {
  const [isFocusVisible, setIsFocusVisible] = React.useState(false);
  const hasPlayedFocusForCurrentTriggerRef = React.useRef(false);

  React.useEffect(() => {
    if (!showFocus) {
      hasPlayedFocusForCurrentTriggerRef.current = false;
      return;
    }

    if (hasPlayedFocusForCurrentTriggerRef.current) {
      return;
    }

    hasPlayedFocusForCurrentTriggerRef.current = true;
    setIsFocusVisible(true);

    const timeoutId = setTimeout(() => {
      setIsFocusVisible(false);
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [showFocus]);

  return (
    <ListItem
      onClick={onClick}
      groupName="conversation-item"
      className={cn(
        `transition-colors duration-500 ${
          isFocusVisible ? "bg-highlight-50" : ""
        }`,
        className
      )}
    >
      {creator ? (
        <Avatar
          name={creator.fullName}
          visual={creator.portrait}
          size="sm"
          isRounded={true}
        />
      ) : avatar ? (
        <Avatar
          name={avatar.name}
          emoji={avatar.emoji}
          visual={avatar.visual}
          size="sm"
          isRounded={avatar.isRounded}
          backgroundColor={avatar.backgroundColor}
        />
      ) : null}
      <div className="mb-0.5 flex min-w-0 grow flex-col gap-1">
        <div className="heading-sm flex w-full items-center justify-between gap-2 text-foreground">
          <div className="flex min-w-0 flex-1 gap-2 overflow-hidden">
            <span className="min-w-0 truncate">
              {textAnimation === "streaming" ? (
                <AnimatedText variant="muted">
                  {conversation.title}
                </AnimatedText>
              ) : (
                conversation.title
              )}
            </span>
            {creator && (
              <span className="hidden shrink-0 text-muted-foreground sm:inline">
                {creator.fullName}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {unread && (
              <div
                className={cn(
                  "heading-xs flex flex-shrink-0 items-center justify-center rounded-full h-2 w-2 m-1 bg-highlight-500"
                )}
              />
            )}
            <span className={cn("font-normal", unread && "text-highlight")}>
              {time}
            </span>
          </div>
        </div>
        {conversation.description && (
          <div className="line-clamp-2 text-sm font-normal text-muted-foreground">
            {textAnimation === "streaming" ? (
              <AnimatedText variant="muted">
                {conversation.description}
              </AnimatedText>
            ) : (
              conversation.description
            )}
          </div>
        )}
        {replySection && replySection}
      </div>
    </ListItem>
  );
}
