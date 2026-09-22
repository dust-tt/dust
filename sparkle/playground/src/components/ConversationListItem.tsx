import { AnimatedText, cn, Icon, ListItem } from "@dust-tt/sparkle";
import React, { type ReactNode } from "react";

import type { RowBadge } from "../data/rowBadges";
import { AvatarCounter } from "./AvatarCounter";
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
   * The name beside the title, for a row that goes by someone other than its
   * creator — whoever spoke last, say, or the agent behind an automated run.
   * Rows that say nothing about it are still their creator's.
   */
  byline?: string;
  /**
   * Leading visual rendered instead of the avatar, for an avatar that carries a
   * badge or an overlay. Pass `creator` or `byline` alongside it to keep the
   * name by the title.
   */
  leadingVisual?: ReactNode;
  /**
   * Marks the avatar with what the list this row sits in leaves open — which
   * kind of work it is, in a list that mixes them. Rows that need no
   * explaining go without.
   */
  badge?: RowBadge;
  /**
   * Breathes the leading avatar, for a conversation something is still
   * happening in. A `leadingVisual` carries its own busy state instead.
   */
  busy?: boolean;
  /** Icon shown before the title, for lists whose rows are labelled by a category. */
  titleIcon?: React.ComponentType<{ className?: string }>;
  /**
   * A lead-in run into the start of the description, in bold, for a row whose
   * description needs placing — "In Privacy" on a pod conversation, "Request"
   * on a request. The colon and the space after it are the row's, not the
   * caller's.
   */
  descriptionPrefix?: ReactNode;
  /**
   * A glyph run into the description, for a row whose description is a step
   * being taken rather than something that was said — the tool the step reaches
   * for. It comes after the descriptionPrefix, so the sentence still opens with
   * what places the row.
   */
  descriptionIcon?: React.ComponentType<{ className?: string }>;
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
 * and a descriptionPrefix opens the description when what places the row — the
 * pod it happened in, the kind of work it is — belongs in the sentence rather
 * than beside it. Rows given menuItems answer to a right-click with them. Use
 * it to render an inbox or activity feed of conversations, grouping rows inside
 * ListGroup so dividers and spacing stay consistent.
 * @summary Conversation summary row for inbox lists.
 */
/**
 * @cc [owner:Duncid,label:product] description-prefix-inline
 * `descriptionPrefix` MUST be drawn inside the description line, as a bold
 * lead-in the description continues from on the same line and under the same
 * truncation. It MUST NOT become a chip, a badge or a line of its own: what it
 * says belongs to the sentence, not beside it.
 */
export function ConversationListItem({
  conversation,
  unread,
  avatar,
  creator,
  byline,
  leadingVisual,
  badge,
  busy = false,
  titleIcon,
  descriptionPrefix,
  descriptionIcon,
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
  const rowByline = byline ?? creator?.fullName;

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
          <AvatarCounter
            name={creator.fullName}
            visual={creator.portrait}
            size="sm"
            isRounded={true}
            busy={busy}
            badgeIcon={badge?.icon}
            badgeLabel={badge?.label}
          />
        ) : avatar ? (
          <AvatarCounter
            name={avatar.name}
            emoji={avatar.emoji}
            visual={avatar.visual}
            size="sm"
            isRounded={avatar.isRounded}
            backgroundColor={avatar.backgroundColor}
            busy={busy}
            badgeIcon={badge?.icon}
            badgeLabel={badge?.label}
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
              {rowByline && (
                <span className="hidden shrink-0 text-muted-foreground sm:inline">
                  {rowByline}
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
          {(descriptionPrefix || conversation.description) && (
            <div className="line-clamp-2 text-sm font-normal text-muted-foreground">
              {descriptionPrefix && (
                <span className="heading-sm">{descriptionPrefix}: </span>
              )}
              {descriptionIcon && (
                <Icon
                  visual={descriptionIcon}
                  size="xs"
                  // A 16px glyph beside 14px text hangs a hair low on the
                  // baseline it is centred against, so it is lifted back onto
                  // the line the words sit on.
                  className="mr-1 inline-block -translate-y-px align-middle text-faint"
                />
              )}
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
