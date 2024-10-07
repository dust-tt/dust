import React, { ComponentType, ReactNode, useState } from "react";

import Spinner from "@sparkle/components/Spinner";
import { ArrowDownSIcon, ArrowRightSIcon } from "@sparkle/icons";
import { classNames } from "@sparkle/lib/utils";

import { Checkbox, CheckboxProps } from "./Checkbox";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";

export interface TreeProps {
  children?: ReactNode;
  isBoxed?: boolean;
  isLoading?: boolean;
  tailwindIconTextColor?: string;
  variant?: "navigator" | "finder";
}

export function Tree({
  children,
  isLoading,
  isBoxed = false,
  tailwindIconTextColor,
  variant = "finder",
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
    <div className="s-py-2 s-pl-4">
      <Spinner size="xs" variant="dark" />
    </div>
  ) : (
    <div
      className={classNames(
        "s-flex s-flex-col s-gap-1 s-overflow-hidden",
        isBoxed
          ? "s-rounded-xl s-border s-border-structure-200 s-bg-structure-50 s-p-4"
          : ""
      )}
    >
      {modifiedChildren}
    </div>
  );
}

const treeItemStyleClasses = {
  base: "s-group/tree s-flex s-cursor-default s-flex-row s-items-center",
  isNavigatableBase:
    "s-border s-transition-colors s-duration-300 s-ease-out s-cursor-pointer",
  isNavigatableUnselected:
    "s-border-structure-200/0 s-bg-white/0 hover:s-border-structure-200 hover:s-bg-white",
  isNavigatableSelected: "s-border-structure-200 s-bg-white",
};

interface TreeItemProps {
  label?: string;
  type?: "node" | "item" | "leaf";
  size?: "sm" | "md";
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

Tree.Item = function ({
  label,
  type = "node",
  className = "",
  labelClassName = "",
  size = "sm",
  tailwindIconTextColor = "s-text-element-800",
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
}: TreeItemPropsWithChildren | TreeItemPropsWithRender) {
  const [collapsedState, setCollapsedState] = useState<boolean>(
    defaultCollapsed ?? true
  );

  const isControlledCollapse = collapsed !== undefined;

  const effectiveCollapsed = isControlledCollapse ? collapsed : collapsedState;
  const effectiveOnChevronClick = isControlledCollapse
    ? onChevronClick
    : () => setCollapsedState(!collapsedState);

  const getChildren = () => {
    if (effectiveCollapsed) {
      return [];
    }

    return typeof renderTreeItems === "function" ? renderTreeItems() : children;
  };

  const childrenToRender = getChildren();

  const isExpanded = childrenToRender && !effectiveCollapsed;

  return (
    <>
      <div
        className={classNames(
          className ? className : "",
          treeItemStyleClasses.base,
          onItemClick ? "s-cursor-pointer" : "",
          isNavigatable ? treeItemStyleClasses.isNavigatableBase : "",
          isNavigatable
            ? size === "sm"
              ? "s-gap-1 s-rounded-lg s-py-1 s-pl-1.5 s-pr-3"
              : "s-gap-2 s-rounded-lg s-py-2 s-pl-2.5 s-pr-4"
            : size === "sm"
              ? "s-gap-1 s-py-1"
              : "s-gap-2 s-py-2",
          isNavigatable
            ? isSelected
              ? treeItemStyleClasses.isNavigatableSelected
              : treeItemStyleClasses.isNavigatableUnselected
            : "",
          isExpanded ? "is-expanded" : "is-collapsed",
          type
        )}
        onClick={onItemClick ? onItemClick : undefined}
      >
        {type === "node" && (
          <IconButton
            icon={isExpanded ? ArrowDownSIcon : ArrowRightSIcon}
            size="xs"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              if (effectiveOnChevronClick) {
                effectiveOnChevronClick();
              }
            }}
          />
        )}
        {type === "leaf" && <div className="s-w-4 s-flex-shrink-0"></div>}
        {checkbox && <Checkbox {...checkbox} size="xs" />}
        <Icon
          visual={visual}
          size={size === "sm" ? "sm" : "md"}
          className={classNames("s-flex-shrink-0", tailwindIconTextColor)}
        />

        <div
          className={classNames(
            `s-truncate s-font-medium s-text-element-900 ${labelClassName}`,
            size === "sm" ? "s-ml-1 s-text-sm" : "s-ml-1 s-text-base"
          )}
        >
          {label}
        </div>
        <div className="s-grow" />
        {actions && (
          <div
            className={classNames(
              "s-flex s-gap-2 s-pl-4",
              areActionsFading
                ? "s-transform s-opacity-0 s-duration-300 group-hover/tree:s-opacity-100"
                : ""
            )}
          >
            {actions}
          </div>
        )}
      </div>
      {React.Children.count(childrenToRender) > 0 && (
        <div className="s-pl-2.5">{childrenToRender}</div>
      )}
    </>
  );
};

interface TreeEmptyProps {
  label: string;
}

Tree.Empty = function ({ label }: TreeEmptyProps) {
  return (
    <div className="s-py-1 s-pl-6 s-text-sm s-font-medium s-text-element-700">
      {label}
    </div>
  );
};
