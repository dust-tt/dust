import React, { ComponentType, ReactNode } from "react";

import { classNames } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

type PlatformItemProps = {
  title: string;
  visual: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  hasSeparator?: boolean;
};

export function PlatformItem({
  title,
  visual,
  action,
  children,
  hasSeparator = true,
}: PlatformItemProps) {
  return (
    <div
      className={classNames(
        hasSeparator ? "s-border-b s-border-structure-200" : "",
        "s-flex s-w-full s-flex-col"
      )}
      aria-label={title}
    >
      <div className="s-flex s-flex-row s-gap-3 s-pb-5 s-pt-4">
        <div className="s-flex">{visual}</div>
        <div className="s-flex s-grow s-flex-col">
          <div className="s-text-normal s-flex s-h-9 s-flex-col s-justify-center s-font-semibold">
            {title}
          </div>
          {children}
        </div>
        <div>{action}</div>
      </div>
    </div>
  );
}

interface PlatformItemListProps {
  children: ReactNode;
  className?: string;
}

PlatformItem.List = function ({ children, className }: PlatformItemListProps) {
  // Ensure all children are of type PlatformItem
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.type !== PlatformItem) {
      throw new Error(
        "All children of PlatformItem.List must be of type PlatformItem"
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
      className={classNames(className ? className : "", "s-flex s-flex-col")}
    >
      {modifiedChildren}
    </div>
  );
};

interface PlatformItemDescriptionProps {
  children?: ReactNode;
  description?: string;
}

PlatformItem.Description = function ({
  children,
  description,
}: PlatformItemDescriptionProps) {
  return (
    <>
      {description && (
        <div className="s-text-sm s-font-normal s-text-element-600">
          {description}
        </div>
      )}
      {children && <>{children}</>}
    </>
  );
};

interface PlatformItemVisualProps {
  visual?: ComponentType<{ className?: string }>;
}

PlatformItem.Visual = function ({ visual }: PlatformItemVisualProps) {
  return (
    <div className="s-flex s-h-9 s-flex-col s-justify-center">
      <Icon size="md" visual={visual} />
    </div>
  );
};
