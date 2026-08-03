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
  size?: "xs" | "sm";
  action?: ReactNode;
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
