import { cn } from "@sparkle/lib/utils";
import React from "react";

import { ListItem } from "./ListItem";

export type UniversalSearchItemProps = {
  /** Leading icon or avatar identifying the result type. */
  visual?: React.ReactNode;
  /** Result title; accepts a React node so multiple spans can be composed and truncated. */
  title: React.ReactNode;
  /** Optional snippet rendered below the title, clamped to one line. */
  description?: React.ReactNode;
  /** Highlights the row as the active result; drive it from keyboard navigation. */
  selected?: boolean;
  /** Called when the row is clicked, to open the result. */
  onClick?: () => void;
  className?: string;
  /** Toggles the divider below the row (defaults to true). */
  hasSeparator?: boolean;
};

/**
 * A result row for a universal/global search, pairing a leading `visual` (icon or
 * avatar) with a `title` and optional `description` snippet. Use it to render
 * heterogeneous search results (documents, conversations, people) in a single global
 * search list, grouping rows in `ListGroup`; it is built on `ListItem`, so reach for
 * that primitive for non-search rows.
 *
 * @summary Global search result row.
 */
export function UniversalSearchItem({
  visual,
  title,
  description,
  selected = false,
  onClick,
  className,
  hasSeparator = true,
}: UniversalSearchItemProps) {
  return (
    <ListItem
      onClick={onClick}
      className={cn(selected && "bg-highlight-50", className)}
      hasSeparator={hasSeparator}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {visual}
        <div className="flex min-w-0 flex-1 flex-col text-foreground">
          <div className="heading-sm flex min-w-0 gap-1 truncate text-foreground">
            {title}
          </div>
          {description && (
            <div className="line-clamp-1 text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>
    </ListItem>
  );
}
