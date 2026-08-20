import { Button } from "@sparkle/components/Button";
import { Icon } from "@sparkle/components/Icon";
import { Spinner } from "@sparkle/components/Spinner";
import {
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components/Tooltip";
import { ChevronDown, ChevronRight } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React, {
  type ComponentType,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Checkbox, type CheckboxProps } from "./Checkbox";

export interface TreeProps {
  children?: ReactNode;
  /** Wraps the tree in a rounded, bordered, muted container. */
  isBoxed?: boolean;
  /** Shows a spinner below the items, e.g. while a branch is lazily loading or paginating. */
  isLoading?: boolean;
  /** Lets item content (e.g. tooltips, menus) overflow the tree container. */
  overflowVisible?: boolean;
  /** Tailwind text color class applied to the items' visual icons. */
  tailwindIconTextColor?: string;
  /** "navigator" makes items navigatable (hover/selected row styling); "finder" is the plain default. */
  variant?: "navigator" | "finder";
  className?: string;
}

/**
 * A hierarchical, expandable list wrapping a set of `Tree.Item` nodes, each taking a
 * `label`, optional `visual` icon, and nested children. Use it to browse nested
 * structures such as folders, data sources, or document hierarchies; for lazily loaded
 * branches, render a child `<Tree isLoading />` until data arrives rather than blocking
 * the whole tree.
 *
 * @summary Hierarchical expandable list.
 */
export function Tree({
  children,
  isLoading,
  isBoxed = false,
  overflowVisible = false,
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
          "flex flex-col gap-0.5",
          overflowVisible ? "overflow-visible" : "overflow-hidden",
          isBoxed &&
            "rounded-xl border border-border bg-muted-background px-3 py-2",
          className
        )}
      >
        <div>{modifiedChildren}</div>
        {isLoading && (
          // add the spinner below modifiedChildren to keep the layout
          // thus preventing re-render in case of pagination
          <div className={cn("flex justify-center py-2")}>
            <Spinner size="xs" />
          </div>
        )}
      </div>
    </>
  );
}

const treeItemStyleClasses = {
  base: "group/tree flex cursor-default flex-row items-center gap-2 h-9",
  isNavigatableBase:
    "rounded-xl pl-1.5 pr-3 cursor-pointer transition-colors duration-150 motion-reduce:transition-none",
  isNavigatableUnselected: cn("bg-hover/0", "hover:bg-hover"),
  isNavigatableSelected: cn("font-medium", "bg-selected"),
};

interface TreeItemProps {
  label?: string;
  /** "node" (default) shows an expand chevron; "leaf" is terminal and indented in place of the chevron; "item" has neither. */
  type?: "node" | "item" | "leaf";
  /** Tailwind text color class for the visual icon (defaults to "text-muted-foreground"). */
  tailwindIconTextColor?: string;
  /** Leading icon distinguishing the node kind (e.g. folder vs. document). */
  visual?: ComponentType<{ className?: string }>;
  /** Renders a Checkbox before the icon for multi-selection; forwarded as its props. */
  checkbox?: CheckboxProps;
  /** Called when the chevron is clicked; makes the collapse state controlled together with `collapsed`. */
  onChevronClick?: () => void;
  /** Controlled collapse state; leave undefined to let the item manage it internally. */
  collapsed?: boolean;
  /** Initial collapse state when uncontrolled (defaults to true). */
  defaultCollapsed?: boolean;
  className?: string;
  labelClassName?: string;
  /** Trailing controls (buttons, menus) rendered after the label. */
  actions?: React.ReactNode;
  /** Fades the `actions` in only while the row is hovered (defaults to true). */
  areActionsFading?: boolean;
  /** Applies navigatable row styling (hover/selected background); set by Tree's "navigator" variant. */
  isNavigatable?: boolean;
  /** Highlights the row as the current selection (navigatable styling). */
  isSelected?: boolean;
  /** Called when the row itself is clicked (checkbox and button clicks are excluded). */
  onItemClick?: () => void;
  id?: string;
}

export interface TreeItemPropsWithChildren extends TreeItemProps {
  renderTreeItems?: never;
  children?: React.ReactNode;
}

export interface TreeItemPropsWithRender extends TreeItemProps {
  /** Lazily renders the nested items only when the item is expanded, instead of `children`. */
  renderTreeItems: () => React.ReactNode;
  children?: never;
}

/**
 * One row of a `Tree`: a chevron (for `type="node"`), optional `checkbox`, `visual`
 * icon, truncating `label` with an automatic tooltip, and trailing `actions`. Nested
 * items go in `children`, or in `renderTreeItems` to defer rendering until expanded.
 *
 * @summary Single tree row.
 */
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
              ? "cursor-pointer"
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
          {type === "leaf" && <div className="w-[24px] flex-shrink-0"></div>}
          {checkbox && <Checkbox {...checkbox} />}
          <Icon visual={visual} size="sm" className={tailwindIconTextColor} />
          {isTruncated ? (
            <TooltipProvider>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <div
                    ref={labelRef}
                    className={cn(
                      "font-medium truncate text-sm text-primary",
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
                "font-medium truncate text-sm text-primary",
                labelClassName
              )}
            >
              {label}
            </div>
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

interface TreeEmptyProps {
  label: string;
  onItemClick?: () => void;
}

Tree.Empty = function ({ label, onItemClick }: TreeEmptyProps) {
  return (
    <div
      className={cn(
        "copy-sm py-1.5 pl-6 italic",
        "text-muted-foreground",
        onItemClick ? "cursor-pointer" : ""
      )}
      onClick={onItemClick}
    >
      {label}
    </div>
  );
};
