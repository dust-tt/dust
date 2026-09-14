import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ReactNode } from "react";

const listItemVariants = cva("group flex w-full flex-row gap-3 p-3", {
  variants: {
    itemsAlignment: {
      start: "items-start",
      center: "items-center",
    },
    hasSeparator: {
      true: "border-b border-border",
      false: "",
    },
    hasSeparatorIfLast: {
      true: "",
      false: "last:border-none",
    },
    interactive: {
      true: cn(
        "cursor-pointer transition duration-200",
        "hover:bg-muted-background",
        "active:bg-primary-100"
      ),
      false: "",
    },
  },
  defaultVariants: {
    itemsAlignment: "start",
    hasSeparator: true,
    hasSeparatorIfLast: false,
    interactive: false,
  },
});

type ListItemProps = {
  children: ReactNode;
  className?: string;
  /** Invoked when the row is clicked; also enables the hover/pressed background. */
  onClick?: () => void;
  /** Shows a bottom border divider under the row (default true). */
  hasSeparator?: boolean;
  /** Keeps the divider on the last row of a group instead of hiding it (default false). */
  hasSeparatorIfLast?: boolean;
  /** Name of the Tailwind group scope (`group/<name>`) so children can react to the row's hover. */
  groupName?: string;
  /** Vertical alignment of the row's children: "start" or "center". */
  itemsAlignment?: "start" | "center";
  /** CSS selector for descendants whose presses should not trigger the pressed state (e.g. inline actions). */
  ignorePressSelector?: string;
};

/**
 * A low-level, generic list row that wraps arbitrary children with consistent
 * padding, an optional bottom separator, and a hover background when `onClick`
 * is provided. Use it as the base building block for custom list rows; for
 * richer purpose-built rows prefer ContextItem, ConversationListItem, or
 * UniversalSearchItem, which are built on top of this primitive.
 *
 * @summary Generic list row primitive.
 */
export function ListItem({
  children,
  className,
  onClick,
  hasSeparator = true,
  hasSeparatorIfLast = false,
  groupName = "list-item",
  itemsAlignment = "start",
  ignorePressSelector,
}: ListItemProps) {
  const [isPressed, setIsPressed] = React.useState(false);

  const shouldIgnorePress = (target: EventTarget | null) => {
    if (!ignorePressSelector || !(target instanceof HTMLElement)) {
      return false;
    }
    return Boolean(target.closest(ignorePressSelector));
  };

  return (
    <div
      className={cn(
        listItemVariants({
          itemsAlignment,
          hasSeparator,
          hasSeparatorIfLast,
          interactive: !!onClick,
        }),
        `group/${groupName}`,
        isPressed && "bg-primary-100",
        className
      )}
      onClick={onClick}
      onMouseDown={(event) => {
        if (!onClick || shouldIgnorePress(event.target)) {
          return;
        }
        setIsPressed(true);
      }}
      onMouseUp={() => setIsPressed(false)}
      onMouseLeave={() => setIsPressed(false)}
    >
      {children}
    </div>
  );
}

type ListGroupProps = {
  children: ReactNode;
  className?: string;
};

/**
 * A vertical container for ListItem rows, framed by top and bottom borders.
 * Use it to wrap a set of ListItems so they read as one list.
 *
 * @summary Bordered container for list rows.
 */
export function ListGroup({ children, className }: ListGroupProps) {
  return (
    <div
      className={cn("flex flex-col border-b border-t border-border", className)}
    >
      {children}
    </div>
  );
}

type ListItemSectionProps = {
  children: ReactNode;
  className?: string;
  /** Header style: "xs" is an uppercase muted caption, "sm" is a filled heading row. */
  size?: "xs" | "sm";
  /** Trailing content (e.g. buttons) whose clicks do not trigger the section's `onClick`. */
  action?: ReactNode;
  /** Invoked when the section header is clicked; also enables hover feedback. */
  onClick?: () => void;
};

const listItemSectionVariants = cva("", {
  variants: {
    size: {
      xs: "heading-xs uppercase pb-2 pt-4 text-muted-foreground",
      sm: "heading-sm bg-muted-background p-2 text-foreground",
    },
    interactive: {
      true: cn(
        "cursor-pointer transition duration-200",
        "active:bg-primary-100"
      ),
      false: "",
    },
    isHovered: {
      true: "hover:bg-primary-100 active:bg-primary-150",
      false: "",
    },
  },
  defaultVariants: {
    size: "xs",
    interactive: false,
    isHovered: false,
  },
});

/**
 * A section header for grouping ListItem rows (e.g. "Today", "Yesterday"),
 * with an optional trailing `action` area and click handling. Use it inside a
 * ListGroup to title clusters of related rows.
 *
 * @summary Section header for list groups.
 */
export function ListItemSection({
  children,
  className,
  size = "xs",
  action,
  onClick,
}: ListItemSectionProps) {
  const [isHoveringAction, setIsHoveringAction] = React.useState(false);
  const [isHoveringMain, setIsHoveringMain] = React.useState(false);

  return (
    <div
      className={cn(
        listItemSectionVariants({
          size,
          interactive: !!onClick,
          isHovered: !!onClick && isHoveringMain && !isHoveringAction,
        }),
        "group/section-item flex items-center justify-between",
        className
      )}
      onClick={onClick}
      onMouseEnter={() => {
        setIsHoveringMain(true);
      }}
      onMouseLeave={() => {
        setIsHoveringMain(false);
        setIsHoveringAction(false);
      }}
    >
      <div className="flex items-center gap-1 overflow-hidden text-ellipsis">
        {children}
      </div>
      {action && (
        <div
          className="flex gap-1"
          onClick={(e) => {
            e.stopPropagation();
          }}
          onMouseEnter={() => {
            setIsHoveringAction(true);
          }}
          onMouseLeave={() => {
            setIsHoveringAction(false);
          }}
        >
          {action}
        </div>
      )}
    </div>
  );
}
