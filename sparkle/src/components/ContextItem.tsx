import { cn } from "@sparkle/lib/utils";
import React, { type ComponentType, type ReactNode } from "react";

import { Icon } from "./Icon";
import { ListItem } from "./ListItem";

type ContextItemProps = {
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  hasSeparator?: boolean;
  hasSeparatorIfLast?: boolean;
  subElement?: ReactNode;
  title: ReactNode;
  visual: ReactNode;
  hoverAction?: boolean;
  onClick?: () => void;
  truncateSubElement?: boolean;
};

export function ContextItem({
  action,
  children,
  className,
  hasSeparator = true,
  hasSeparatorIfLast = false,
  subElement,
  title,
  visual,
  hoverAction,
  onClick,
  truncateSubElement,
}: ContextItemProps) {
  return (
    <ListItem
      className={className}
      onClick={onClick}
      hasSeparator={hasSeparator}
      hasSeparatorIfLast={hasSeparatorIfLast}
      groupName="context-item"
      itemsAlignment={children ? "start" : "center"}
    >
      {visual}
      <div className="mb-0.5 flex min-w-0 grow flex-col gap-0">
        <div className="flex min-w-0 grow flex-col text-foreground sm:flex-row sm:gap-3">
          <div
            className={cn(
              "heading-base",
              truncateSubElement
                ? "shrink-0"
                : "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
            )}
          >
            {title}
          </div>
          {subElement &&
            (truncateSubElement ? (
              <div className="flex min-w-0 items-center gap-3 overflow-hidden text-sm text-muted-foreground">
                <div className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {subElement}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 overflow-hidden text-sm text-muted-foreground">
                {subElement}
              </div>
            ))}
        </div>
        {children && <div>{children}</div>}
      </div>
      <div
        className={cn(
          hoverAction &&
            "opacity-0 transition-opacity duration-200 group-hover/context-item:opacity-100"
        )}
      >
        {action}
      </div>
    </ListItem>
  );
}

interface ContextItemListProps {
  children: ReactNode;
  className?: string;
  hasBorder?: boolean;
}

ContextItem.List = function ({
  children,
  className,
  hasBorder,
}: ContextItemListProps) {
  // Ensure all children are of type ContextItem or ContextItem.SectionHeader
  React.Children.forEach(children, (child) => {
    if (child === null || child === undefined) {
      return;
    }
    if (
      !React.isValidElement(child) ||
      (child.type !== ContextItem &&
        child.type !== ContextItem.SectionHeader &&
        // all children of child must be of type ContextItem or ContextItem.SectionHeader
        React.Children.toArray(child.props.children).some(
          (c) =>
            !React.isValidElement(c) ||
            (c.type !== ContextItem && c.type !== ContextItem.SectionHeader)
        ))
    ) {
      throw new Error(
        "All children of ContextItem.List must be of type ContextItem or ContextItem.SectionHeader"
      );
    }
  });

  return (
    <div
      className={cn(
        "flex flex-col",
        className,
        hasBorder && "border-b border-t border-border"
      )}
    >
      {children}
    </div>
  );
};

interface ContextItemDescriptionProps {
  children?: ReactNode;
  description?: string;
}

ContextItem.Description = function ({
  children,
  description,
}: ContextItemDescriptionProps) {
  return (
    <>
      {description && (
        <div className="text-sm font-normal text-muted-foreground">
          {description}
        </div>
      )}
      {children && <>{children}</>}
    </>
  );
};

interface ContextItemVisualProps {
  visual?: ComponentType<{ className?: string }>;
}

ContextItem.Visual = function ({ visual }: ContextItemVisualProps) {
  return <Icon size="md" visual={visual} />;
};

interface ItemSectionHeaderProps {
  title: string;
  description?: string;
  hasBorder?: boolean;
}

ContextItem.SectionHeader = function ({
  title,
  description,
  hasBorder = true,
}: ItemSectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-0 pb-3 pt-7",
        hasBorder && "border-b border-border"
      )}
    >
      <div className="heading-xl text-foreground">{title}</div>
      {description && (
        <div className="copy-sm text-muted-foreground">{description}</div>
      )}
    </div>
  );
};
