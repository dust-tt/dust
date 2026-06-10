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
      <div className="s-flex s-flex-col s-gap-0.5">{children}</div>
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
          return "s-h-2 s-w-2 s-m-1 s-bg-highlight-500 dark:s-bg-highlight-500-night";
        case "blocked":
          return "s-h-2 s-w-2 s-m-1 s-bg-golden-400 dark:s-bg-golden-400-night";
        case "error":
          return "s-h-2 s-w-2 s-m-1 s-bg-warning-400 dark:s-bg-warning-400-night";
        default:
          return "";
      }
    };

    const shouldShowStatusDot = status !== "idle";
    const counterValue = count && count > 0 ? count : undefined;
    const shouldHideStatusIndicators = Boolean(moreMenu && selected);

    return (
      <div
        className={cn("s-group/menu-item s-relative", className)}
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
              "s-peer/menu-button",
              "s-text-primary dark:s-text-primary-night s-font-medium",
              "s-box-border s-flex s-items-center s-w-full s-gap-1.5 s-cursor-pointer s-select-none",
              "s-items-center s-outline-none s-rounded-lg s-text-sm s-p-2 s-transition-colors",
              "data-[disabled]:s-pointer-events-none",
              "hover:s-bg-stone-100 dark:hover:s-bg-primary-200-night",
              selected && "s-bg-stone-100 dark:s-bg-primary-200-night",
              disabled && "s-pointer-events-none s-cursor-default s-opacity-50"
            )}
          >
            {icon && !disabled && (
              <Icon
                visual={icon}
                size="xs"
                className="s-m-0.5 s-text-muted-foreground dark:s-text-muted-foreground-night"
              />
            )}
            {disabled && (
              <Icon
                visual={Lock01}
                size="xs"
                className="s-m-0.5 s-text-muted-foreground dark:s-text-muted-foreground-night"
              />
            )}
            {avatar}
            {label && (
              <span
                className={cn(
                  "s-overflow-hidden s-text-ellipsis s-whitespace-nowrap",
                  !suffix &&
                    "s-grow group-focus-within/menu-item:s-pr-8 group-hover/menu-item:s-pr-8 group-data-[selected=true]/menu-item:s-pr-8",
                  hasActivity && "s-font-semibold"
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
                  "s-flex s-grow s-flex-shrink-0 s-items-center",
                  moreMenu &&
                    "group-focus-within/menu-item:s-hidden group-hover/menu-item:s-hidden"
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
                  "s-flex-shrink-0 s-translate-x-0.5",
                  moreMenu &&
                    "group-focus-within/menu-item:s-hidden group-hover/menu-item:s-hidden"
                )}
              />
            )}
            {shouldShowStatusDot && !shouldHideStatusIndicators && (
              <div
                className={cn(
                  "s-heading-xs s-flex s-flex-shrink-0 s-items-center s-justify-center s-rounded-full",
                  moreMenu &&
                    "group-focus-within/menu-item:s-hidden group-hover/menu-item:s-hidden",
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
        "s-absolute s-right-2 s-top-1.5 s-transition-opacity",
        forceVisible
          ? "s-opacity-100"
          : "s-opacity-0 group-focus-within/menu-item:s-opacity-100 group-hover/menu-item:s-opacity-100",
        className
      )}
      {...props}
    >
      <Button size="xmini" icon={DotsHorizontal} variant="ghost" />
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
      "s-flex s-items-center s-justify-between s-gap-2 s-pt-4 s-pb-2 s-px-2 s-whitespace-nowrap s-overflow-hidden s-text-ellipsis",
      "s-text-sm",
      "s-bg-app-background dark:s-bg-app-background-night",
      "s-text-muted-foreground dark:s-text-muted-foreground-night",
      isSticky &&
        "s-sticky s-top-0 s-z-10 s-border-border dark:s-border-border-night",
      className
    )}
    {...props}
  >
    <div className="s-flex s-items-center s-gap-1 s-overflow-hidden s-text-ellipsis">
      <span className="s-overflow-hidden s-text-ellipsis">{label}</span>
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
      "s-flex s-px-2 s-py-1 s-pl-3 s-text-[10px] s-font-semibold s-text-faint dark:s-text-faint-night s-pt-3 s-uppercase s-whitespace-nowrap s-overflow-hidden s-text-ellipsis",
      isSticky &&
        "s-sticky s-top-0 s-z-10 s-bg-muted-background dark:s-bg-muted-background-night s-border-border dark:s-border-border-night",
      className
    )}
    {...props}
  >
    <div className="s-flex s-items-center s-gap-1 s-overflow-hidden s-text-ellipsis">
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
    "s-w-full s-flex-1 s-text-left s-w-full",
    "s-text-muted-foreground dark:s-text-muted-foreground-night",
    "s-text-sm s-whitespace-nowrap s-overflow-hidden s-text-ellipsis",
    "s-select-none",
    "s-outline-none s-rounded-xl",
    "data-[disabled]:s-pointer-events-none"
  ),
  {
    variants: {
      isCollapsible: {
        true: cn(
          "s-cursor-pointer s-mb-0.5"
          // "hover:s-bg-primary-100 dark:hover:s-bg-primary-200-night"
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
        <span className="s-flex s-items-center s-gap-1.5">
          {icon && <Icon visual={icon} size="xs" />}
          <span className="s-overflow-hidden s-text-ellipsis">{label}</span>
          {counterValue !== undefined && (
            <Counter value={counterValue} size="xs" variant="highlight" />
          )}
        </span>
      </div>
    );

    const actionElement = action && (
      <div
        className={cn(
          "s-flex s-gap-1 s-transition-opacity",
          actionOnHover
            ? "[@media(hover:hover)_and_(pointer:fine)]:s-opacity-0 hover:s-opacity-100 group-has-[:focus-visible]/menu-item:s-opacity-100 group-hover/menu-item:s-opacity-100"
            : "s-opacity-100"
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
      <div className="s-flex s-flex-col s-gap-0.5">
        {visibleChildrenSlice}
        {hasPartialCollapse && (
          <Collapsible open={isShowingAll} onOpenChange={setIsShowingAll}>
            <CollapsibleContent>
              <div className="s-flex s-flex-col s-gap-0.5">
                {overflowChildren}
              </div>
            </CollapsibleContent>
            <div className="s-px-1.5 s-py-1 s-gap-1 s-flex">
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
                    overflowHasActivity ? "[&>div]:s-font-bold" : undefined
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
          <div className="s-group/menu-item s-relative s-flex s-flex-1 s-items-center s-justify-start s-gap-2 s-pl-2 s-py-1.5 s-font-medium">
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
        <div className="s-group/menu-item s-relative s-flex s-flex-1 s-items-center s-text-sm s-font-medium s-justify-start s-gap-2 s-pl-2 s-py-1.5 s-text-muted-foreground dark:s-text-muted-foreground-night">
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
