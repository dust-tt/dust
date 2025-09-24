import React, {
  ComponentType,
  ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Button,
  Icon,
  Spinner,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components/";
import { ArrowDownSIcon, ArrowRightSIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { Checkbox, CheckboxProps } from "./Checkbox";

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

  return (
    <>
      <div
        className={cn(
          "s-flex s-flex-col s-gap-0.5 s-overflow-hidden",
          isBoxed &&
            "s-rounded-xl s-border s-border-border s-bg-muted-background s-px-3 s-py-2 dark:s-border-border-night dark:s-bg-muted-background-night",
          className
        )}
      >
        <div>{modifiedChildren}</div>
        {isLoading && (
          // add the spinner below modifiedChildren to keep the layout
          // thus preventing re-render in case of pagination
          <div className={cn("s-flex s-justify-center s-py-2")}>
            <Spinner size="xs" />
          </div>
        )}
      </div>
    </>
  );
}

const treeItemStyleClasses = {
  base: "s-group/tree s-flex s-cursor-default s-flex-row s-items-center s-gap-2 s-h-9",
  isNavigatableBase:
    "s-rounded-xl s-pl-1.5 s-pr-3 s-transition-colors s-duration-300 s-ease-out s-cursor-pointer",
  isNavigatableUnselected: cn(
    "s-bg-primary-100/0 dark:s-bg-primary-100-night/0",
    "hover:s-bg-primary-100 dark:hover:s-bg-primary-100-night"
  ),
  isNavigatableSelected: cn(
    "s-font-medium",
    "s-bg-primary-100 dark:s-bg-primary-100-night"
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
  id?: string;
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
      tailwindIconTextColor = "s-text-foreground dark:s-text-foreground-night",
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
      id,
    },
    ref
  ) => {
    const [isTruncated, setIsTruncated] = useState(false);
    const labelRef = React.useRef<HTMLDivElement>(null);

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

    const canExpand = effectiveOnChevronClick && type === "node";
    const getChildren = () => {
      if (effectiveCollapsed) {
        return [];
      }

      return typeof renderTreeItems === "function"
        ? renderTreeItems()
        : children;
    };

    const childrenToRender = getChildren();

    const checkTruncation = useCallback(() => {
      if (labelRef.current) {
        setIsTruncated(
          labelRef.current.scrollWidth > labelRef.current.clientWidth
        );
      }
    }, []);

    useEffect(() => {
      const observer = new ResizeObserver(checkTruncation);
      if (labelRef.current) {
        observer.observe(labelRef.current);
        checkTruncation();
      }
      return () => observer.disconnect();
    }, [checkTruncation]);

    const isExpanded = childrenToRender && !effectiveCollapsed;

    return (
      <>
        <div
          ref={ref}
          id={id}
          className={cn(
            treeItemStyleClasses.base,
            onItemClick || checkbox?.onCheckedChange || canExpand
              ? "s-cursor-pointer"
              : "",
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
          onClick={
            onItemClick ||
            ((e) => {
              // Skip if click on checkbox or any button
              if (
                e.target instanceof HTMLElement &&
                e.target.tagName !== "BUTTON"
              ) {
                e.stopPropagation();
                if (checkbox?.onCheckedChange) {
                  checkbox.onCheckedChange?.(!checkbox.checked);
                } else if (canExpand) {
                  effectiveOnChevronClick();
                }
              }
            })
          }
        >
          {type === "node" && (
            <Button
              icon={isExpanded ? ArrowDownSIcon : ArrowRightSIcon}
              size="xmini"
              variant="ghost-secondary"
              disabled={!effectiveOnChevronClick}
              onClick={(e) => {
                e.stopPropagation();
                if (effectiveOnChevronClick) {
                  effectiveOnChevronClick();
                }
              }}
            />
          )}
          {type === "leaf" && (
            <div className="s-w-[24px] s-flex-shrink-0"></div>
          )}
          {checkbox && <Checkbox {...checkbox} size="xs" />}
          <Icon visual={visual} size="sm" className={tailwindIconTextColor} />
          {isTruncated ? (
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <div
                    ref={labelRef}
                    className={cn(
                      "s-font-regular s-truncate s-text-sm s-text-foreground dark:s-text-foreground-night",
                      labelClassName
                    )}
                  >
                    {label}
                  </div>
                </TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent side="top" align="start">
                    {label}
                  </TooltipContent>
                </TooltipPortal>
              </TooltipRoot>
            </TooltipProvider>
          ) : (
            <div
              ref={labelRef}
              className={cn(
                "s-font-regular s-truncate s-text-sm s-text-foreground dark:s-text-foreground-night",
                labelClassName
              )}
            >
              {label}
            </div>
          )}
          {actions && (
            <div
              className={cn(
                "s-flex s-grow s-gap-2",
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
        "s-copy-sm s-py-1.5 s-pl-6 s-italic",
        "s-text-muted-foreground dark:s-text-muted-foreground-night",
        onItemClick ? "s-cursor-pointer" : ""
      )}
      onClick={onItemClick}
    >
      {label}
    </div>
  );
};
