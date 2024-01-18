import React, { ComponentType, ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

type ContextItemProps = {
  action?: ReactNode;
  children?: ReactNode;
  hasSeparator?: boolean;
  subElement?: ReactNode;
  title: ReactNode;
  visual: ReactNode;
  onClick?: () => void;
};

export function ContextItem({
  action,
  children,
  hasSeparator = true,
  subElement,
  title,
  visual,
  onClick,
}: ContextItemProps) {
  return (
    <div
      className={classNames(
        hasSeparator ? "s-border-b s-border-structure-200" : "",
        "s-flex s-w-full s-flex-col"
      )}
    >
      <div
        className={classNames(
          "s-flex s-flex-row s-items-start s-gap-3 s-px-4 s-py-3",
          onClick
            ? "s-cursor-pointer s-transition s-duration-200 hover:s-bg-structure-50 active:s-bg-structure-100"
            : ""
        )}
        onClick={onClick}
      >
        <div className="s-flex">{visual}</div>
        <div className="s-mb-0.5 s-flex s-grow s-flex-col s-gap-0">
          <div className="s-flex s-grow s-flex-row s-gap-3">
            <div className="s-flex s-flex-col s-justify-center s-text-base s-font-semibold">
              {title}
            </div>
            <div className="s-flex s-items-center s-gap-1 s-text-sm s-text-element-600">
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
    if (
      !React.isValidElement(child) ||
      (child.type !== ContextItem && child.type !== ContextItem.SectionHeader)
    ) {
      throw new Error(
        "All children of ContextItem.List must be of type ContextItem or ContextItem.SectionHeader"
      );
    }
  });

  // Convert children into an array and modify the last child's props
  const modifiedChildren = React.Children.toArray(children).map(
    (child, index, array) => {
      if (React.isValidElement(child) && index === array.length - 1) {
        return React.cloneElement(child, {
          ...child.props,
          hasSeparator: false,
        });
      }
      return child;
    }
  );

  return (
    <div
      className={classNames(
        className ? className : "",
        hasBorder ? "s-border-b s-border-t s-border-structure-200" : "",
        "s-flex s-flex-col"
      )}
    >
      {modifiedChildren}
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
        <div className="s-text-sm s-font-normal s-text-element-700">
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
}

ContextItem.SectionHeader = function ({
  title,
  description,
}: ItemSectionHeaderProps) {
  return (
    <div className="s-flex s-flex-col s-gap-0 s-border-b s-border-structure-200 s-pb-3 s-pt-7">
      <div className="s-text-xl s-font-medium s-text-element-900 dark:s-text-element-900-dark">
        {title}
      </div>
      {description && (
        <div className="s-text-sm s-font-normal s-text-element-700 dark:s-text-element-700-dark">
          {description}
        </div>
      )}
    </div>
  );
};
