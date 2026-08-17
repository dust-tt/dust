import type * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { AnimatedText } from "@sparkle/components/AnimatedText";
import { Button } from "@sparkle/components/Button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import { Counter } from "@sparkle/components/Counter";
import { Icon } from "@sparkle/components/Icon";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { TypingAnimation } from "@sparkle/components/TypingAnimation";
import { Lock01 } from "@sparkle/icons";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  DotsHorizontal,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import * as React from "react";

interface NavigationListProps {
  viewportRef?: React.RefObject<HTMLDivElement>;
}

const NavigationList = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> &
    NavigationListProps
>(({ className, children, viewportRef, ...props }, ref) => {
  return (
    <ScrollArea
      ref={ref}
      viewportRef={viewportRef}
      className={className}
      {...props}
    >
      <div className="flex flex-col gap-0.5">{children}</div>
      <ScrollBar />
    </ScrollArea>
  );
});
NavigationList.displayName = "NavigationList";

export type NavigationListItemStatus = "idle" | "unread" | "blocked" | "error";

interface NavigationListItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<LinkWrapperProps, "children" | "className"> {
  selected?: boolean;
  disabled?: boolean;
  label?: string;
  labelAnimation?: "none" | "typing" | "streaming";
  onTypingAnimationComplete?: () => void;
  icon?: React.ComponentType;
  avatar?: React.ReactNode;
  moreMenu?: React.ReactNode;
  keepHoverOnMoreMenu?: boolean;
  status?: NavigationListItemStatus;
  count?: number;
  hasActivity?: boolean;
  suffix?: React.ReactNode;
}

const NavigationListItem = React.forwardRef<
  HTMLDivElement,
  NavigationListItemProps
>(
  (
    {
      className,
      selected,
      disabled,
      label,
      labelAnimation = "none",
      onTypingAnimationComplete,
      icon,
      avatar,
      href,
      target,
      rel,
      replace,
      shallow,
      moreMenu,
      keepHoverOnMoreMenu,
      status = "idle",
      count,
      hasActivity,
      suffix,
      ...props
    },
    ref
  ) => {
    const getStatusDotColor = () => {
      switch (status) {
        case "unread":
          return "h-2 w-2 m-1 bg-highlight-500";
        case "blocked":
          return "h-2 w-2 m-1 bg-info-400";
        case "error":
          return "h-2 w-2 m-1 bg-warning-400";
        default:
          return "";
      }
    };

    const shouldShowStatusDot = status !== "idle";
    const counterValue = count && count > 0 ? count : undefined;

    return (
      <div
        className={cn("group/menu-item relative", className)}
        ref={ref}
        data-nav="menu-button"
        data-selected={selected}
        data-disabled={disabled}
        {...props}
      >
        <LinkWrapper
          className="group/nav-item focus-visible:outline-hidden"
          href={disabled ? undefined : href}
          target={target}
          rel={rel}
          replace={replace}
          shallow={shallow}
        >
          <div
            aria-disabled={disabled}
            className={cn(
              "peer/menu-button",
              "text-muted-foreground font-medium",
              "box-border flex items-center w-full gap-1.5 cursor-pointer select-none",
              "items-center outline-hidden rounded-lg text-sm p-2 transition-colors duration-150 motion-reduce:transition-none",
              "group-focus-visible/nav-item:ring-2 group-focus-visible/nav-item:ring-inset group-focus-visible/nav-item:ring-ring",
              "data-[disabled]:pointer-events-none",
              !disabled &&
                (keepHoverOnMoreMenu
                  ? "group-hover/menu-item:bg-hover group-hover/menu-item:text-primary"
                  : "hover:bg-hover hover:text-primary"),
              selected && "bg-selected text-primary",
              disabled && "pointer-events-none cursor-default opacity-50"
            )}
          >
            {(icon || disabled) && (
              <Icon
                visual={disabled ? Lock01 : icon}
                size="xs"
                className="m-0.5 text-muted-foreground"
              />
            )}
            {avatar}
            {label && (
              <span
                className={cn(
                  "overflow-hidden text-ellipsis whitespace-nowrap",
                  !suffix &&
                    "grow group-focus-within/menu-item:pr-8 group-hover/menu-item:pr-8 group-data-[selected=true]/menu-item:pr-8",
                  hasActivity && "font-semibold"
                )}
              >
                {labelAnimation === "typing" ? (
                  <TypingAnimation
                    text={label}
                    duration={32}
                    onComplete={onTypingAnimationComplete}
                  />
                ) : labelAnimation === "streaming" ? (
                  <AnimatedText variant="muted">{label}</AnimatedText>
                ) : (
                  label
                )}
              </span>
            )}
            {suffix && (
              <div
                className={cn(
                  "flex grow flex-shrink-0 items-center justify-end",
                  moreMenu &&
                    "group-focus-within/menu-item:hidden group-hover/menu-item:hidden"
                )}
              >
                {suffix}
              </div>
            )}
            {counterValue !== undefined && (
              <Counter
                value={counterValue}
                size="xs"
                variant="outline"
                className={cn(
                  "flex-shrink-0 translate-x-0.5",
                  moreMenu &&
                    "group-focus-within/menu-item:hidden group-hover/menu-item:hidden"
                )}
              />
            )}
            {shouldShowStatusDot && (
              <div
                className={cn(
                  "heading-xs flex flex-shrink-0 items-center justify-center rounded-full",
                  moreMenu &&
                    "group-focus-within/menu-item:hidden group-hover/menu-item:hidden",
                  getStatusDotColor()
                )}
              />
            )}
          </div>
        </LinkWrapper>
        {moreMenu && <>{moreMenu}</>}
      </div>
    );
  }
);
NavigationListItem.displayName = "NavigationListItem";

interface NavigationListItemActionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  showOnHover?: boolean;
  forceVisible?: boolean;
}

const NavigationListItemAction = React.forwardRef<
  HTMLDivElement,
  NavigationListItemActionProps
>(({ className, forceVisible, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "absolute right-2 top-1.5 transition-opacity",
        forceVisible
          ? "opacity-100"
          : "opacity-0 group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100",
        className
      )}
      {...props}
    >
      <Button
        size="xmini"
        icon={DotsHorizontal}
        variant="ghost"
        className="hover:bg-hover active:bg-selected"
      />
    </div>
  );
});
NavigationListItemAction.displayName = "NavigationListItemAction";

interface NavigationListLabelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  icon?: React.ComponentType;
  action?: React.ReactNode;
  isSticky?: boolean;
}

const NavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListLabelProps
>(({ className, label, icon, isSticky, action, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center justify-between gap-2 pt-4 pb-2 px-2 whitespace-nowrap overflow-hidden text-ellipsis",
      "text-sm",
      "bg-app-background",
      "text-muted-foreground",
      isSticky && "sticky top-0 z-10 border-border",
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-1 overflow-hidden text-ellipsis">
      {icon && <Icon visual={icon} size="xs" />}
      <span className="overflow-hidden text-ellipsis">{label}</span>
    </div>
    {action}
  </div>
));

NavigationListLabel.displayName = "NavigationListLabel";

interface NavigationListCompactLabelProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  isSticky?: boolean;
}

const NavigationListCompactLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListCompactLabelProps
>(({ className, label, isSticky, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // px-2 matches NavigationListItem's p-2 so the label's text aligns with
      // the item labels underneath it. The lopsided pt-4/pb-1 groups the label
      // with the items it heads, and breaks it away from the group above.
      "flex px-2 py-1 text-xs font-semibold text-faint pt-4 uppercase whitespace-nowrap overflow-hidden text-ellipsis",
      isSticky && "sticky top-0 z-10 bg-muted-background border-border",
      className
    )}
    {...props}
  >
    <div className="flex items-center gap-1 overflow-hidden text-ellipsis">
      {label}
    </div>
  </div>
));

NavigationListCompactLabel.displayName = "NavigationListCompactLabel";

interface NavigationListCollapsibleSectionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  icon?: React.ComponentType;
  /** Count badge shown next to the label (e.g. number of unread items). */
  count?: number;
  action?: React.ReactNode;
  actionOnHover?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  type?: "static" | "collapse";
  children: React.ReactNode;
  /** Number of children to show when partially collapsed. undefined = show all (current behavior). */
  visibleItems?: number;
  /** Count badge to show on the "Show all" button (e.g. total mentions in hidden items). */
  overflowCount?: number;
  /** Whether to bold the "Show all" button label (e.g. when hidden items have unread activity). */
  overflowHasActivity?: boolean;
}

const collapseableStyles = cva(
  cn(
    "text-left",
    "text-muted-foreground",
    "text-sm whitespace-nowrap overflow-hidden text-ellipsis",
    "select-none",
    "outline-hidden rounded-xl",
    "data-[disabled]:pointer-events-none"
  ),
  {
    variants: {
      isCollapsible: {
        true: "cursor-pointer",
        false: "",
      },
      // Static headers fill the row; collapsible ones shrink-wrap so the
      // chevron sits right next to the label instead of at the row's edge.
      grow: {
        true: "w-full flex-1",
        false: "min-w-0",
      },
    },
    defaultVariants: {
      isCollapsible: false,
      grow: true,
    },
  }
);

const NavigationListCollapsibleSection = React.forwardRef<
  HTMLDivElement | React.ElementRef<typeof Collapsible>,
  NavigationListCollapsibleSectionProps
>(
  (
    {
      label,
      icon,
      count,
      action,
      actionOnHover = true,
      children,
      className,
      type = "static",
      defaultOpen,
      open,
      onOpenChange,
      visibleItems,
      overflowCount,
      overflowHasActivity,
      ...props
    },
    ref
  ) => {
    const [isShowingAll, setIsShowingAll] = React.useState(false);

    const childArray = React.Children.toArray(children);
    const hasPartialCollapse =
      visibleItems !== undefined && visibleItems < childArray.length;

    const visibleChildrenSlice = hasPartialCollapse
      ? childArray.slice(0, visibleItems)
      : childArray;

    const overflowChildren = hasPartialCollapse
      ? childArray.slice(visibleItems)
      : [];

    const isCollapsible = type !== "static";
    const counterValue = count && count > 0 ? count : undefined;
    const labelElement = (
      <div
        className={cn(
          "notranslate",
          collapseableStyles({ isCollapsible, grow: !isCollapsible }),
          // The collapsible header row owns the text color (including its
          // hover state), so the label inherits it instead of forcing its own.
          isCollapsible && "text-inherit"
        )}
      >
        <span className="flex items-center gap-1.5">
          {icon && <Icon visual={icon} size="xs" />}
          <span className="overflow-hidden text-ellipsis">{label}</span>
          {counterValue !== undefined && (
            <Counter value={counterValue} size="xs" variant="highlight" />
          )}
        </span>
      </div>
    );

    const actionElement = action && (
      <div
        // Lets the header row keep its active styling while a menu opened from
        // one of these actions is still open (see the collapse header below).
        data-nav="section-action"
        className={cn(
          "flex gap-1 transition-opacity",
          actionOnHover
            ? cn(
                "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 hover:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 group-hover/menu-item:opacity-100",
                // The pointer leaves the row to navigate the menu it just
                // opened; keep the action visible until the menu closes.
                "has-[[data-state=open]]:opacity-100"
              )
            : "opacity-100"
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {action}
      </div>
    );

    const handleOpenChange = (newOpen: boolean) => {
      if (!newOpen) {
        setIsShowingAll(false);
      }
      onOpenChange?.(newOpen);
    };

    const renderedContent = (
      <div className="flex flex-col gap-0.5">
        {visibleChildrenSlice}
        {hasPartialCollapse && (
          <Collapsible open={isShowingAll} onOpenChange={setIsShowingAll}>
            <CollapsibleContent>
              <div className="flex flex-col gap-0.5">{overflowChildren}</div>
            </CollapsibleContent>
            <div className="px-1.5 py-1 gap-1 flex">
              {isShowingAll ? (
                <Button
                  size="xs"
                  icon={ChevronUp}
                  variant="ghost-secondary"
                  label="Hide"
                  onClick={() => setIsShowingAll(false)}
                />
              ) : (
                <Button
                  size="xs"
                  icon={ChevronDown}
                  variant="ghost-secondary"
                  label="Show all"
                  isCounter={overflowCount !== undefined && overflowCount > 0}
                  counterValue={String(overflowCount)}
                  className={
                    overflowHasActivity ? "[&>div]:font-bold" : undefined
                  }
                  onClick={() => setIsShowingAll(true)}
                />
              )}
            </div>
          </Collapsible>
        )}
      </div>
    );

    if (type === "static") {
      return (
        <div ref={ref} className={className} {...props}>
          <div className="group/menu-item relative flex flex-1 items-center justify-start gap-2 pl-2 py-1.5 font-medium">
            {labelElement}
            {actionElement}
          </div>
          {renderedContent}
        </div>
      );
    }

    const collapsibleProps = {
      defaultOpen,
      open,
      onOpenChange: handleOpenChange,
      ...props,
    };

    return (
      <Collapsible ref={ref} className={className} {...collapsibleProps}>
        {/* Mirrors the NavigationListItem row, in semibold, so section titles
         * sit in the same rhythm as the items they contain. */}
        <div
          className={cn(
            "group/menu-item relative",
            "text-muted-foreground font-semibold",
            // No gap: it would be dead space between the trigger and the
            // action slot. The trigger's own pr-2 does the separating.
            "box-border flex items-center w-full select-none",
            // The row's own padding lives on the trigger below, so the whole
            // row height is clickable rather than just the label's line box.
            // pr-2 keeps the action slot off the right edge.
            "items-center outline-hidden rounded-lg text-sm pr-2 transition-colors duration-150 motion-reduce:transition-none",
            "hover:bg-hover hover:text-primary",
            // Hold the hover styling while a menu opened from one of the row's
            // actions is still open. Scoped to the action slot so the
            // CollapsibleTrigger's own data-state=open never matches.
            "has-[[data-nav=section-action]_[data-state=open]]:bg-hover has-[[data-nav=section-action]_[data-state=open]]:text-primary"
          )}
        >
          <CollapsibleTrigger hideChevron className="p-2">
            <span className="flex min-w-0 items-center gap-1">
              {labelElement}
              <Icon
                visual={ChevronRight}
                size="xs"
                className="block shrink-0 group-data-[state=open]/col:hidden"
              />
              {/* An expanded section shows its own contents, so the chevron
               * only appears on hover. It keeps its slot (opacity, not
               * display) so the label doesn't shift, and stays visible where
               * there is no hover to rely on: touch and keyboard focus. */}
              <Icon
                visual={ChevronDown}
                size="xs"
                className={cn(
                  "hidden shrink-0 transition-opacity group-data-[state=open]/col:block",
                  "[@media(hover:hover)_and_(pointer:fine)]:opacity-0",
                  "group-hover/menu-item:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100"
                )}
              />
            </span>
          </CollapsibleTrigger>
          {actionElement}
        </div>
        {/* Toggling a sidebar section is a high-frequency action, and the
         * shared height animation is layout-bound — on a long list it reads
         * as lag rather than motion. Open/close instantly instead.
         * With no animation to spill out of, the content can also stop
         * clipping outright, so sticky children pin to the scroll viewport. */}
        <CollapsibleContent
          animated={false}
          className="data-[state=open]:overflow-visible"
        >
          {renderedContent}
        </CollapsibleContent>
      </Collapsible>
    );
  }
);

NavigationListCollapsibleSection.displayName =
  "NavigationListCollapsibleSection";

export {
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListCompactLabel,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
};
