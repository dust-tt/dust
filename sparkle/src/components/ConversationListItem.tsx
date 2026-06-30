import { AnimatedText } from "@sparkle/components/AnimatedText";
import { Avatar } from "@sparkle/components/Avatar";
import { ListItem } from "@sparkle/components/ListItem";
import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

export interface ReplySectionProps {
  replyCount: number;
  unreadCount: number;
  mentionCount?: number;
  avatars: Array<{
    name?: string;
    emoji?: string;
    visual?: string | React.ReactNode;
    isRounded?: boolean;
    backgroundColor?: string;
  }>;
  lastMessageBy: string;
}

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
  conversation: {
    id: string;
    title: string;
    description?: string;
    updatedAt: Date;
  };
  avatar?: {
    name?: string;
    emoji?: string;
    visual?: string | React.ReactNode;
    isRounded?: boolean;
    backgroundColor?: string;
  };
  creator?: {
    fullName: string;
    portrait?: string;
  };
  time: string;
  replySection?: ReactNode;
  onClick?: () => void;
  showFocus?: boolean;
  textAnimation?: "none" | "streaming";
  className?: string;
}

export function ConversationListItem({
  conversation,
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
            <span className="font-normal">{time}</span>
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
