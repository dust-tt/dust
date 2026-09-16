import { AnimatedText, Avatar, cn, Icon, ListItem } from "@dust-tt/sparkle";
import React, { type ReactNode } from "react";

import { type MenuItem, useRowContextMenu } from "./RowContextMenu";

export interface ConversationListItemProps {
  /** Marks the row as unread: shows a highlight dot after the timestamp. */
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
  /**
   * Leading visual rendered instead of the avatar, for an avatar that carries a
   * badge or an overlay. Pass `creator` alongside it to keep the name by the title.
   */
  leadingVisual?: ReactNode;
  /** Icon shown before the title, for lists whose rows are labelled by a category. */
  titleIcon?: React.ComponentType<{ className?: string }>;
  /**
   * Content flowing at the start of the description, for a label the whole row
   * answers to — a chip saying which list it came from, say.
   */
  label?: ReactNode;
  /** Formatted timestamp displayed on the right of the title. */
  time?: string;
  /**
   * Replaces the timestamp, for rows whose right side carries its own state and
   * actions rather than when the conversation last moved.
   */
  trailing?: ReactNode;
  /** Slot for reply/unread/mention counts — use the ReplySection component. */
  replySection?: ReactNode;
  /** Called when the row is clicked (e.g. to open the thread). */
  onClick?: () => void;
  /**
   * Entries offered when the row is right-clicked — leaving the conversation,
   * say. Without them the browser's own menu is left alone.
   */
  menuItems?: MenuItem[];
  /** Briefly flashes a highlight background on the row when it becomes true. */
  showFocus?: boolean;
  /** "streaming" animates the title and description as if being generated. */
  textAnimation?: "none" | "streaming";
  className?: string;
}

/**
 * A list row summarising a conversation: title and description, a timestamp,
 * and a leading avatar (direct) or creator portrait (group), replaceable by a
 * leadingVisual, with an optional titleIcon before the title and an optional
 * replySection for reply/unread/mention counts. The timestamp gives way to a
 * trailing node when the right side carries its own state and actions instead,
 * and a label flows into the description when the row has to be labelled as a
 * whole. Rows given menuItems answer to a right-click with them. Use it to
 * render an inbox or activity feed of conversations, grouping rows inside
 * ListGroup so dividers and spacing stay consistent.
 * @summary Conversation summary row for inbox lists.
 */
export function ConversationListItem({
  conversation,
  unread,
  avatar,
  creator,
  leadingVisual,
  titleIcon,
  label,
  time,
  trailing,
  replySection,
  onClick,
  menuItems,
  showFocus = false,
  textAnimation = "none",
  className,
}: ConversationListItemProps) {
  const [isFocusVisible, setIsFocusVisible] = React.useState(false);
  const hasPlayedFocusForCurrentTriggerRef = React.useRef(false);
  const { onContextMenu, contextMenu } = useRowContextMenu(menuItems);

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
    <>
      <ListItem
        onClick={onClick}
        onContextMenu={onContextMenu}
        groupName="conversation-item"
        className={cn(
          `transition-colors duration-500 ${
            isFocusVisible ? "bg-highlight-50" : ""
          }`,
          className
        )}
      >
        {leadingVisual ? (
          leadingVisual
        ) : creator ? (
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
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              {titleIcon && (
                <Icon visual={titleIcon} size="xs" className="shrink-0" />
              )}
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
              {trailing ?? <span className="font-normal">{time}</span>}
              {unread && (
                <div className="h-2 w-2 flex-shrink-0 rounded-full bg-highlight-500" />
              )}
            </div>
          </div>
          {(label || conversation.description) && (
            <div className="line-clamp-2 text-sm font-normal text-muted-foreground">
              {label && <span className="mr-1 align-middle">{label}</span>}
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
      {contextMenu}
    </>
  );
}
