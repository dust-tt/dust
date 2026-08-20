import { cn } from "@sparkle/lib/utils";
import React, { type ComponentType, type ReactNode } from "react";

import { Icon } from "./Icon";
import { ListItem } from "./ListItem";

type ContextItemProps = {
  /** Trailing control(s) rendered on the right of the row (e.g. Buttons, a SliderToggle). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Draws a separator below the row (default true). */
  hasSeparator?: boolean;
  /** Keeps the separator even when the row is the last of its list. */
  hasSeparatorIfLast?: boolean;
  /** Secondary metadata rendered next to the title (e.g. author, timestamp). */
  subElement?: ReactNode;
  title: ReactNode;
  /** Leading visual — typically a ContextItem.Visual logo or an Avatar. */
  visual: ReactNode;
  /** Hides the action until the row is hovered. */
  hoverAction?: boolean;
  /** Called when the row is clicked; makes the row interactive. */
  onClick?: () => void;
  /** Truncates the subElement with an ellipsis instead of the title. */
  truncateSubElement?: boolean;
};

/**
 * A rich list row for representing a resource, connection, or agent, with a
 * leading visual, a title, optional subElement metadata, free-form children,
 * and a trailing action. Use it to list connected platforms, data sources,
 * agents, or settings entries, composing rows inside ContextItem.List; for a
 * denser settings layout with a single control, prefer SettingsList.Row.
 * @summary Rich list row with visual, metadata, and action.
 */
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

/** Vertical list container for ContextItem rows and ContextItem.SectionHeader groups. */
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

/** Muted description text rendered inside a ContextItem row. */
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

/** Standard-size icon/logo wrapper for a ContextItem row's leading visual. */
ContextItem.Visual = function ({ visual }: ContextItemVisualProps) {
  return <Icon size="md" visual={visual} />;
};

interface ItemSectionHeaderProps {
  title: string;
  description?: string;
  hasBorder?: boolean;
}

/** Titled section header used to break a ContextItem.List into groups. */
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
