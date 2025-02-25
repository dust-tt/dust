import React, { ComponentType, ReactNode, useState } from "react";

import { Button, Spinner } from "@sparkle/components/";
import { ArrowDownSIcon, ArrowRightSIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

import { Checkbox, CheckboxProps } from "./Checkbox";
import { Icon } from "./Icon";

export interface TreeProps {
  children?: ReactNode;
  isBoxed?: boolean;
  isLoading?: boolean;
  tailwindIconTextColor?: string;
  variant?: "navigator" | "finder";
  className?: string;
}

export function Tree({
  children,
  isLoading,
  isBoxed = false,
  tailwindIconTextColor,
  variant = "finder",
  className,
}: TreeProps) {
  const modifiedChildren = React.Children.map(children, (child) => {
    // /!\ Limitation: This stops on the first invalid element.
    // Meaning that if Tree.Item is not the first child, it will not work.
    if (React.isValidElement<TreeItemProps>(child)) {
      // Clone the child element and pass the necessary props
      const childProps: Partial<TreeItemProps> = {};

      if (variant === "navigator") {
        childProps.isNavigatable = true;
      }

      if (tailwindIconTextColor) {
        childProps.tailwindIconTextColor = tailwindIconTextColor;
      }

      return React.cloneElement(child, childProps);
    }
    return child;
  });

  return isLoading ? (
    <div className={cn("s-py-2 s-pl-4", className)}>
      <Spinner size="xs" variant="dark" />
    </div>
  ) : (
    <div
      className={cn(
        "s-flex s-flex-col s-gap-0.5 s-overflow-hidden",
        isBoxed &&
          "s-rounded-xl s-border s-border-structure-200 s-bg-structure-50 s-p-4 dark:s-border-structure-200-night dark:s-bg-structure-50-night",
        className
      )}
    >
      {modifiedChildren}
    </div>
  );
}

const treeItemStyleClasses = {
  base: "s-group/tree s-flex s-cursor-default s-flex-row s-items-center s-gap-2 s-h-9",
  isNavigatableBase:
    "s-rounded-xl s-pl-1 s-pr-3 s-transition-colors s-duration-300 s-ease-out s-cursor-pointer",
  isNavigatableUnselected: cn(
    "s-bg-structure-150/0 dark:s-bg-structure-150-night/0",
    "hover:s-bg-structure-150 dark:hover:s-bg-structure-150-night"
  ),
  isNavigatableSelected: cn(
    "s-font-medium",
    "s-bg-structure-150 dark:s-bg-structure-150-night"
  ),
};

interface TreeItemProps {
  label?: string;
  type?: "node" | "item" | "leaf";
  tailwindIconTextColor?: string;
  visual?: ComponentType<{ className?: string }>;
  checkbox?: CheckboxProps;
  onChevronClick?: () => void;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
  labelClassName?: string;
  actions?: React.ReactNode;
  areActionsFading?: boolean;
  isNavigatable?: boolean;
  isSelected?: boolean;
  onItemClick?: () => void;
}

export interface TreeItemPropsWithChildren extends TreeItemProps {
  renderTreeItems?: never;
  children?: React.ReactNode;
}

export interface TreeItemPropsWithRender extends TreeItemProps {
  renderTreeItems: () => React.ReactNode;
  children?: never;
}

Tree.Item = React.forwardRef<
  HTMLDivElement,
  TreeItemPropsWithChildren | TreeItemPropsWithRender
>(
  (
    {
      label,
      type = "node",
      className = "",
      labelClassName = "",
      tailwindIconTextColor = "s-text-element-800 dark:s-text-element-800-night",
      visual,
      checkbox,
      onChevronClick,
      collapsed,
      defaultCollapsed,
      actions,
      areActionsFading = true,
      renderTreeItems,
      children,
      isNavigatable = false,
      isSelected = false,
      onItemClick,
    },
    ref
  ) => {
    const [collapsedState, setCollapsedState] = useState<boolean>(
      defaultCollapsed ?? true
    );

    const isControlledCollapse = collapsed !== undefined;

    const effectiveCollapsed = isControlledCollapse
      ? collapsed
      : collapsedState;
    const effectiveOnChevronClick = isControlledCollapse
      ? onChevronClick
      : () => setCollapsedState(!collapsedState);

    const getChildren = () => {
      if (effectiveCollapsed) {
        return [];
      }

      return typeof renderTreeItems === "function"
        ? renderTreeItems()
        : children;
    };

    const childrenToRender = getChildren();

    const isExpanded = childrenToRender && !effectiveCollapsed;

    return (
      <>
        <div
          ref={ref}
          className={cn(
            treeItemStyleClasses.base,
            onItemClick ? "s-cursor-pointer" : "",
            isNavigatable ? treeItemStyleClasses.isNavigatableBase : "",
            isNavigatable
              ? isSelected
                ? treeItemStyleClasses.isNavigatableSelected
                : treeItemStyleClasses.isNavigatableUnselected
              : "",
            isExpanded ? "is-expanded" : "is-collapsed",
            type,
            className
          )}
          onClick={onItemClick}
        >
          {type === "node" && (
            <Button
              icon={isExpanded ? ArrowDownSIcon : ArrowRightSIcon}
              size="xs"
              variant="ghost-secondary"
              onClick={(e) => {
                e.stopPropagation();
                if (effectiveOnChevronClick) {
                  effectiveOnChevronClick();
                }
              }}
            />
          )}
          {type === "leaf" && (
            <div className="s-w-[34px] s-flex-shrink-0"></div>
          )}
          {checkbox && <Checkbox {...checkbox} size="xs" />}
          <Icon visual={visual} size="sm" className={tailwindIconTextColor} />
          <div
            className={`s-font-regular s-truncate s-text-sm s-text-foreground dark:s-text-foreground-night ${labelClassName}`}
          >
            {label}
          </div>
          <div className="s-grow" />
          {actions && (
            <div
              className={cn(
                "s-flex s-gap-2 s-pl-4",
                areActionsFading &&
                  "s-transform s-opacity-0 s-duration-300 group-hover/tree:s-opacity-100"
              )}
            >
              {actions}
            </div>
          )}
        </div>
        {React.Children.count(childrenToRender) > 0 && (
          <div className="s-pl-4">{childrenToRender}</div>
        )}
      </>
    );
  }
);

interface TreeEmptyProps {
  label: string;
  onItemClick?: () => void;
}

Tree.Empty = function ({ label, onItemClick }: TreeEmptyProps) {
  return (
    <div
      className={cn(
        "s-font-regular s-py-1.5 s-pl-6 s-text-sm",
        "s-text-muted-foreground dark:s-text-muted-foreground-night",
        onItemClick ? "s-cursor-pointer" : ""
      )}
      onClick={onItemClick}
    >
      {label}
    </div>
  );
};
