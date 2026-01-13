import React, { ReactNode } from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Counter } from "@sparkle/components/Counter";
import { ListItem } from "@sparkle/components/ListItem";

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
  messageCount?: number;
  replySection?: ReactNode;
  onClick?: () => void;
}

export function ConversationListItem({
  conversation,
  avatar,
  creator,
  time,
  messageCount,
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
          <div className="s-flex s-gap-2">
            {creator && creator.fullName}
            <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
              {conversation.title}
            </span>
          </div>
          <div className="s-flex s-items-center s-gap-2 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            <span className="s-font-normal">{time}</span>
            {messageCount !== undefined && (
              <Counter value={messageCount} size="xs" variant="outline" />
            )}
          </div>
        </div>
        {conversation.description && (
          <div className="s-line-clamp-2 s-text-sm s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night">
            {conversation.description}
          </div>
        )}
        {replySection && (
          <div className="s-heading-xs s-flex s-items-center s-gap-2 s-pt-2 s-text-muted-foreground dark:s-text-muted-foreground-night">
            {replySection}
          </div>
        )}
      </div>
    </ListItem>
  );
}
