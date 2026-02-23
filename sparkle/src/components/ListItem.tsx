import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ReactNode } from "react";

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
  ignorePressSelector?: string;
};

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
        `s-group/${groupName}`,
        isPressed && "s-bg-primary-100 dark:s-bg-primary-100-night",
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
  size?: "xs" | "sm";
  action?: ReactNode;
  onClick?: () => void;
};

const listItemSectionVariants = cva("", {
  variants: {
    size: {
      xs: "s-heading-xs s-uppercase s-pb-2 s-pt-4 s-text-muted-foreground dark:s-text-muted-foreground-night",
      sm: "s-heading-sm s-bg-muted-background s-p-2 dark:s-bg-muted-background-night/50 s-text-foreground dark:s-text-foreground-night",
    },
    interactive: {
      true: cn(
        "s-cursor-pointer s-transition s-duration-200",
        "active:s-bg-primary-100 dark:active:s-bg-primary-100-night"
      ),
      false: "",
    },
    isHovered: {
      true: "hover:s-bg-primary-100 hover:dark:s-bg-primary-100-night active:s-bg-primary-150 active:dark:s-bg-primary-150-night",
      false: "",
    },
  },
  defaultVariants: {
    size: "xs",
    interactive: false,
    isHovered: false,
  },
});

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
        "s-group/section-item s-flex s-items-center s-justify-between",
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
      <div className="s-flex s-items-center s-gap-1 s-overflow-hidden s-text-ellipsis">
        {children}
      </div>
      {action && (
        <div
          className="s-flex s-gap-1"
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
