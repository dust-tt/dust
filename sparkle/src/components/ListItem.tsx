import React, { ReactNode } from "react";

import { cn } from "@sparkle/lib/utils";

type ListItemProps = {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  hasSeparator?: boolean;
  hasSeparatorIfLast?: boolean;
  groupName?: string;
  itemsAlignment?: "start" | "center";
};

export function ListItem({
  children,
  className,
  onClick,
  hasSeparator = true,
  hasSeparatorIfLast = false,
  groupName = "list-item",
  itemsAlignment = "start",
}: ListItemProps) {
  return (
    <div
      className={cn(
        `s-group/${groupName} s-flex s-w-full s-flex-row s-gap-3 s-px-3 s-py-3`,
        itemsAlignment === "start" ? "s-items-start" : "s-items-center",
        hasSeparator && "s-border-b s-border-border dark:s-border-border-night",
        !hasSeparatorIfLast && "last:s-border-none",
        onClick &&
          cn(
            "s-cursor-pointer s-transition s-duration-200",
            "hover:s-bg-muted-background dark:hover:s-bg-muted-background-night",
            "active:s-bg-primary-100 dark:active:s-bg-primary-100-night"
          ),
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

type ListGroupProps = {
  children: ReactNode;
  className?: string;
};

export function ListGroup({ children, className }: ListGroupProps) {
  return (
    <div
      className={cn(
        "s-flex s-flex-col s-border-b s-border-t s-border-border dark:s-border-border-night",
        className
      )}
    >
      {children}
    </div>
  );
}

type ListItemSectionProps = {
  children: ReactNode;
  className?: string;
};

export function ListItemSection({ children, className }: ListItemSectionProps) {
  return (
    <h3
      className={cn(
        "s-pb-2 s-pt-6 s-text-xs s-font-semibold s-uppercase s-tracking-wide s-text-muted-foreground dark:s-text-muted-foreground-night",
        className
      )}
    >
      {children}
    </h3>
  );
}
