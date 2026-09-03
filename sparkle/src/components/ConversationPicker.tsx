import {
  ListGroup,
  ListItem,
  ListItemSection,
} from "@sparkle/components/ListItem";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface ConversationPickerItem {
  id: string;
  title: string;
  /** Formatted timestamp shown on the right of the title (e.g. "2h"). */
  timeLabel?: string;
}

export interface ConversationPickerProps {
  /** Conversations to offer, most recent first. */
  items: ConversationPickerItem[];
  /** Called with the id of the picked conversation. */
  onPick: (id: string) => void;
  /** Section header displayed above the list. */
  label?: string;
  className?: string;
}

/**
 * A compact list of past conversations to resume, shown for instance when a
 * conversation panel opens on an empty state. Renders nothing when there is no
 * conversation to offer.
 *
 * @example
 * ```tsx
 * <ConversationPicker
 *   items={[{ id: "c1", title: "Top agents by spend", timeLabel: "2h" }]}
 *   onPick={(id) => openConversation(id)}
 * />
 * ```
 * @summary Compact picker of past conversations to resume.
 */
export function ConversationPicker({
  items,
  onPick,
  label = "Recent conversations",
  className,
}: ConversationPickerProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex w-full flex-col", className)}>
      <ListItemSection>{label}</ListItemSection>
      <ListGroup>
        {items.map((item) => (
          <ListItem
            key={item.id}
            itemsAlignment="center"
            onClick={() => onPick(item.id)}
          >
            <span className="heading-sm min-w-0 flex-1 truncate text-foreground">
              {item.title}
            </span>
            {item.timeLabel && (
              <span className="shrink-0 text-xs font-normal text-muted-foreground">
                {item.timeLabel}
              </span>
            )}
          </ListItem>
        ))}
      </ListGroup>
    </div>
  );
}
