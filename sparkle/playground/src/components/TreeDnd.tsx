import {
  Button,
  ChevronDown,
  ChevronRight,
  Checkbox,
  type CheckboxProps,
  cn,
  Icon,
  Spinner,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";
import React, {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";

// A playground fork of Sparkle's Tree that can take part in drag and drop.
// Sparkle's `Tree.Item` props do not extend `HTMLAttributes`, and `Tree`
// clones its direct children to inject `isNavigatable`, so neither passing
// handlers through nor wrapping an item in a div works. Same approach as
// DataTableDnd and BreadcrumbsDnd.

export interface TreeDndProps {
  children?: ReactNode;
  isBoxed?: boolean;
  isLoading?: boolean;
  overflowVisible?: boolean;
  tailwindIconTextColor?: string;
  variant?: "navigator" | "finder";
  className?: string;
}

export function TreeDnd({
  children,
  isLoading,
  isBoxed = false,
  overflowVisible = false,
  tailwindIconTextColor,
  variant = "finder",
  className,
}: TreeDndProps) {
  const modifiedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement<TreeDndItemProps>(child)) {
      const childProps: Partial<TreeDndItemProps> = {};

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
    <div
      className={cn(
        "flex flex-col gap-0.5",
        overflowVisible ? "overflow-visible" : "overflow-hidden",
        isBoxed &&
          "rounded-xl border border-border bg-muted-background px-3 py-2",
        className
      )}
    >
      {/* The items carry the gap themselves: the one on the wrapper only ever
          separated them from the spinner below. */}
      <div className="flex flex-col gap-0.5">{modifiedChildren}</div>
      {isLoading && (
        <div className="flex justify-center py-2">
          <Spinner size="xs" />
        </div>
      )}
    </div>
  );
}

const treeItemStyleClasses = {
  base: "group/tree flex cursor-default flex-row items-center gap-2 h-9",
  isNavigatableBase:
    "rounded-xl pl-1.5 pr-3 cursor-pointer transition-colors duration-150 motion-reduce:transition-none",
  isNavigatableUnselected: cn("bg-hover/0", "hover:bg-hover"),
  isNavigatableSelected: cn("font-medium", "bg-selected"),
};

interface TreeDndItemProps {
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
  // ── Drag and drop, the reason this fork exists ──────────────────────────
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLDivElement>;
  onDragEnd?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
  /** Marks the row as the folder a drop would land in. */
  isDropHighlight?: boolean;
  /** Fades the row while it is the one being carried. */
  isDragging?: boolean;
}

export interface TreeDndItemPropsWithChildren extends TreeDndItemProps {
  renderTreeItems?: never;
  children?: React.ReactNode;
}

export interface TreeDndItemPropsWithRender extends TreeDndItemProps {
  renderTreeItems: () => React.ReactNode;
  children?: never;
}

TreeDnd.Item = React.forwardRef<
  HTMLDivElement,
  TreeDndItemPropsWithChildren | TreeDndItemPropsWithRender
>(
  (
    {
      label,
      type = "node",
      className = "",
      labelClassName = "",
      tailwindIconTextColor = "text-muted-foreground",
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
      draggable,
      onDragStart,
      onDragEnd,
      onDragOver,
      onDragLeave,
      onDrop,
      isDropHighlight = false,
      isDragging = false,
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

    const labelElement = (
      <div
        ref={labelRef}
        className={cn(
          "font-medium truncate text-sm text-primary",
          labelClassName
        )}
      >
        {label}
      </div>
    );

    return (
      <>
        <div
          ref={ref}
          id={id}
          className={cn(
            treeItemStyleClasses.base,
            onItemClick || checkbox?.onCheckedChange || canExpand
              ? "cursor-pointer"
              : "",
            isNavigatable ? treeItemStyleClasses.isNavigatableBase : "",
            isNavigatable
              ? isSelected
                ? treeItemStyleClasses.isNavigatableSelected
                : treeItemStyleClasses.isNavigatableUnselected
              : "",
            isDropHighlight && "bg-selected ring-1 ring-highlight",
            isDragging && "opacity-50",
            isExpanded ? "is-expanded" : "is-collapsed",
            type,
            className
          )}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={
            onItemClick
              ? (e) => {
                  if (
                    e.target instanceof HTMLElement &&
                    (e.target.closest('[role="checkbox"]') ||
                      e.target.tagName === "BUTTON")
                  ) {
                    return;
                  }
                  e.stopPropagation();
                  onItemClick();
                }
              : (e) => {
                  if (!(e.target instanceof HTMLElement)) {
                    return;
                  }
                  if (
                    e.target.tagName === "BUTTON" ||
                    e.target.closest('[role="checkbox"]')
                  ) {
                    return;
                  }
                  e.stopPropagation();
                  if (checkbox?.onCheckedChange) {
                    checkbox.onCheckedChange?.(!checkbox.checked);
                  } else if (canExpand) {
                    effectiveOnChevronClick();
                  }
                }
          }
        >
          {type === "node" && (
            <Button
              icon={isExpanded ? ChevronDown : ChevronRight}
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
          {type === "leaf" && <div className="w-[24px] flex-shrink-0" />}
          {checkbox && <Checkbox {...checkbox} />}
          <Icon visual={visual} size="sm" className={tailwindIconTextColor} />
          {isTruncated ? (
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>{labelElement}</TooltipTrigger>
                <TooltipPortal>
                  <TooltipContent side="top" align="start">
                    {label}
                  </TooltipContent>
                </TooltipPortal>
              </TooltipRoot>
            </TooltipProvider>
          ) : (
            labelElement
          )}
          {actions && (
            <div
              className={cn(
                "flex grow gap-2",
                areActionsFading &&
                  "transform opacity-0 duration-300 group-hover/tree:opacity-100"
              )}
            >
              {actions}
            </div>
          )}
        </div>
        {React.Children.count(childrenToRender) > 0 && (
          <div className="pl-4">{childrenToRender}</div>
        )}
      </>
    );
  }
);
