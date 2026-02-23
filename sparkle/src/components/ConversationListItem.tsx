/** biome-ignore-all lint/suspicious/noImportCycles: I'm too lazy to fix that now */

import { Avatar } from "@sparkle/components/Avatar";
import { ListItem } from "@sparkle/components/ListItem";
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
    <div className="s-flex s-items-center s-gap-2 s-pt-2">
      {replyCount > 0 && (
        <Avatar.Stack
          avatars={avatars}
          nbVisibleItems={3}
          onTop={"first" as const}
          size="xs"
        />
      )}
      <div className="s-min-w-0 s-flex-1 s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
        {mentionCount > 0 ? (
          <>
            <span className="s-heading-xs s-text-highlight">
              {mentionCount} {mentionCount === 1 ? "Mention" : "Mentions"}
            </span>
            {unreadCount !== mentionCount && (
              <span className="s-heading-xs  s-text-highlight">
                {" "}
                in {unreadCount} {unreadCount === 1 ? "unread" : "unreads"}
              </span>
            )}
            {replyCount !== unreadCount && (
              <span className="s-heading-xs">
                {" "}
                ({replyCount} {replyCount === 1 ? "reply" : "replies"})
              </span>
            )}
          </>
        ) : unreadCount === 0 ? (
          <span className="s-heading-xs">{replyCount} Replies</span>
        ) : unreadCount === replyCount ? (
          <span className="s-heading-xs s-text-highlight">
            {unreadCount} Unread
          </span>
        ) : (
          <>
            <span className="s-heading-xs s-text-highlight">
              {unreadCount} Unread
            </span>
            {replyCount > 0 && (
              <span className="s-heading-xs"> ({replyCount} replies).</span>
            )}
          </>
        )}{" "}
        {replyCount > 0 && (
          <>
            Last by <span className="s-heading-xs">{lastMessageBy}</span>.
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
}

export function ConversationListItem({
  conversation,
  avatar,
  creator,
  time,
  replySection,
  onClick,
}: ConversationListItemProps) {
  return (
    <ListItem onClick={onClick} groupName="conversation-item">
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
      <div className="s-mb-0.5 s-flex s-min-w-0 s-grow s-flex-col s-gap-1">
        <div className="s-heading-sm s-flex s-w-full s-items-center s-justify-between s-gap-2 s-text-foreground dark:s-text-foreground-night">
          <div className="s-flex s-min-w-0 s-gap-2 s-truncate">
            {creator && <span className="s-shrink-0">{creator.fullName}</span>}
            <span className="s-min-w-0 s-truncate s-text-muted-foreground dark:s-text-muted-foreground-night">
              {conversation.title}
            </span>
          </div>
          <div className="s-flex s-items-center s-gap-2 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            <span className="s-font-normal">{time}</span>
          </div>
        </div>
        {conversation.description && (
          <div className="s-line-clamp-2 s-text-sm s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night">
            {conversation.description}
          </div>
        )}
        {replySection && replySection}
      </div>
    </ListItem>
  );
}
