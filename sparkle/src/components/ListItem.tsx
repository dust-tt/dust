import { cva } from "class-variance-authority";
import React, { ReactNode } from "react";

import { cn } from "@sparkle/lib/utils";

const listItemVariants = cva(
  "s-group s-flex s-w-full s-flex-row s-gap-3 s-p-3",
  {
    variants: {
      itemsAlignment: {
        start: "s-items-start",
        center: "s-items-center",
      },
      hasSeparator: {
        true: "s-border-b s-border-border dark:s-border-border-night",
        false: "",
      },
      hasSeparatorIfLast: {
        true: "",
        false: "last:s-border-none",
      },
      interactive: {
        true: cn(
          "s-cursor-pointer s-transition s-duration-200",
          "hover:s-bg-muted-background dark:hover:s-bg-muted-background-night",
          "active:s-bg-primary-100 dark:active:s-bg-primary-100-night"
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
  }
);

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
        listItemVariants({
          itemsAlignment,
          hasSeparator,
          hasSeparatorIfLast,
          interactive: !!onClick,
        }),
        `s-group/${groupName}`,
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

const listItemSectionVariants = cva(
  "s-pb-2 s-pt-6 s-font-semibold s-tracking-wide s-text-muted-foreground dark:s-text-muted-foreground-night",
  {
    variants: {
      size: {
        xs: "s-text-xs s-uppercase",
        sm: "s-text-sm",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
);

type ListItemSectionProps = {
  children: ReactNode;
  className?: string;
  size?: "xs" | "sm";
  action?: ReactNode;
};

export function ListItemSection({
  children,
  className,
  size = "xs",
  action,
}: ListItemSectionProps) {
  return (
    <h3
      className={cn(
        listItemSectionVariants({ size }),
        "s-flex s-items-center s-justify-between",
        className
      )}
    >
      <div className="s-flex s-items-center s-gap-1 s-overflow-hidden s-text-ellipsis">
        {children}
      </div>
      <div className="s-flex s-gap-1">{action}</div>
    </h3>
  );
}
