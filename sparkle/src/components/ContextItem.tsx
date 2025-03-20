import React, { ComponentType, ReactNode } from "react";

import { classNames, cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

type ContextItemProps = {
  action?: ReactNode;
  children?: ReactNode;
  hasSeparator?: boolean;
  hasSeparatorIfLast?: boolean;
  subElement?: ReactNode;
  title: ReactNode;
  visual: ReactNode;
  onClick?: () => void;
};

export function ContextItem({
  action,
  children,
  hasSeparator = true,
  hasSeparatorIfLast = false,
  subElement,
  title,
  visual,
  onClick,
}: ContextItemProps) {
  return (
    <div
      className={classNames(
        hasSeparator
          ? "s-border-b s-border-border dark:s-border-border-night"
          : "",
        "s-flex s-w-full s-flex-col",
        hasSeparatorIfLast ? "" : "last:s-border-none"
      )}
    >
      <div
        className={classNames(
          "s-flex s-w-full s-flex-row s-items-start s-gap-3 s-px-4 s-py-3",
          onClick
            ? cn(
                "s-cursor-pointer s-transition s-duration-200",
                "hover:s-bg-muted-background dark:hover:s-bg-muted-background-night",
                "active:s-bg-primary-100 dark:active:s-bg-primary-100-night"
              )
            : ""
        )}
        onClick={onClick}
      >
        {visual}
        <div className="s-mb-0.5 s-flex s-min-w-0 s-grow s-flex-col s-gap-0">
          <div className="s-flex s-min-w-0 s-grow s-flex-col s-text-foreground dark:s-text-foreground-night sm:s-flex-row sm:s-gap-3">
            <div className="s-min-w-0 s-overflow-hidden s-text-ellipsis s-whitespace-nowrap s-text-base s-font-semibold">
              {title}
            </div>
            <div className="s-flex s-flex-shrink-0 s-items-center s-gap-3 s-overflow-hidden s-pt-0.5 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {subElement}
            </div>
          </div>
          <div>{children}</div>
        </div>
        <div>{action}</div>
      </div>
    </div>
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
      className={classNames(
        className ? className : "",
        hasBorder
          ? "s-border-b s-border-t s-border-border dark:s-border-border-night"
          : "",
        "s-flex s-flex-col"
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
        <div className="s-text-sm s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night">
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
      className={classNames(
        "s-flex s-flex-col s-gap-0 s-pb-3 s-pt-7",
        hasBorder ? "s-border-b s-border-border dark:s-border-border-night" : ""
      )}
    >
      <div className="s-font-regular s-text-xl s-text-foreground dark:s-text-foreground-night">
        {title}
      </div>
      {description && (
        <div className="s-text-sm s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night">
          {description}
        </div>
      )}
    </div>
  );
};
