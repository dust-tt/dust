import type * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { AnimatedText } from "@sparkle/components/AnimatedText";
import { LegacyButton as Button } from "@sparkle/components/Button";
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
    const shouldHideStatusIndicators = Boolean(moreMenu && selected);

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
              "data-[disabled]:pointer-events-none",
              "hover:bg-hover hover:text-primary",
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
            {counterValue !== undefined && !shouldHideStatusIndicators && (
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
            {shouldShowStatusDot && !shouldHideStatusIndicators && (
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
  action?: React.ReactNode;
  isSticky?: boolean;
}

const NavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListLabelProps
>(({ className, label, isSticky, action, ...props }, ref) => (
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
      "flex px-2 py-1 pl-3 text-[10px] font-semibold text-faint pt-3 uppercase whitespace-nowrap overflow-hidden text-ellipsis",
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
    "w-full flex-1 text-left w-full",
    "text-muted-foreground",
    "text-sm whitespace-nowrap overflow-hidden text-ellipsis",
    "select-none",
    "outline-hidden rounded-xl",
    "data-[disabled]:pointer-events-none"
  ),
  {
    variants: {
      isCollapsible: {
        true: cn(
          "cursor-pointer mb-0.5"
          // "hover:bg-primary-100"
        ),
        false: "",
      },
    },
    defaultVariants: {
      isCollapsible: false,
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
      <div className={cn("notranslate", collapseableStyles({ isCollapsible }))}>
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
        className={cn(
          "flex gap-1 transition-opacity",
          actionOnHover
            ? "[@media(hover:hover)_and_(pointer:fine)]:opacity-0 hover:opacity-100 group-has-[:focus-visible]/menu-item:opacity-100 group-hover/menu-item:opacity-100"
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
        <div className="group/menu-item relative flex flex-1 items-center text-sm font-medium justify-start gap-2 pl-2 py-1.5 text-muted-foreground">
          <CollapsibleTrigger hideChevron>{label}</CollapsibleTrigger>
          {actionElement}
        </div>
        <CollapsibleContent>{renderedContent}</CollapsibleContent>
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
