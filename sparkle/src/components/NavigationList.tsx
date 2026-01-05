import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Icon,
  LinkWrapper,
  LinkWrapperProps,
  ScrollArea,
  ScrollBar,
} from "@sparkle/components/";
import { Button } from "@sparkle/components/Button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import { MoreIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

const NavigationListItemStyles = cva(
  cn(
    "s-box-border s-flex s-items-center s-w-full s-gap-1.5 s-cursor-pointer s-select-none",
    "s-items-center s-outline-none s-rounded-xl s-text-sm s-px-3 s-py-2 s-transition-colors s-duration-300",
    "data-[disabled]:s-pointer-events-none",
    "data-[disabled]:s-text-muted-foreground dark:data-[disabled]:s-text-muted-foreground-night",
    "hover:s-text-foreground dark:hover:s-text-foreground-night",
    "hover:s-bg-primary-100 dark:hover:s-bg-primary-200-night"
  ),
  {
    variants: {
      state: {
        active: "active:s-bg-primary-150 dark:active:s-bg-primary-200-night",
        selected: cn(
          "s-text-foreground dark:s-text-foreground-night",
          "s-bg-primary-100 dark:s-bg-primary-200-night"
        ),
        unselected:
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
      },
    },
    defaultVariants: {
      state: "unselected",
    },
  }
);

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
      className={cn(className, "s-transition-all s-duration-300")}
      {...props}
    >
      <div className="s-flex s-flex-col s-gap-0.5">{children}</div>
      <ScrollBar />
    </ScrollArea>
  );
});
NavigationList.displayName = "NavigationList";

interface NavigationListItemProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    Omit<LinkWrapperProps, "children" | "className"> {
  selected?: boolean;
  label?: string;
  icon?: React.ComponentType;
  avatar?: React.ReactNode;
  moreMenu?: React.ReactNode;
  status?: "idle" | "unread" | "blocked";
}

const NavigationListItem = React.forwardRef<
  HTMLDivElement,
  NavigationListItemProps
>(
  (
    {
      className,
      selected,
      label,
      icon,
      avatar,
      href,
      target,
      rel,
      replace,
      shallow,
      moreMenu,
      status = "idle",
      ...props
    },
    ref
  ) => {
    const [isPressed, setIsPressed] = React.useState(false);

    const handleMouseDown = (event: React.MouseEvent) => {
      if (!(event.target as HTMLElement).closest(".button-class")) {
        setIsPressed(true);
      }
    };

    const getStatusDotColor = () => {
      switch (status) {
        case "unread":
          return "s-bg-highlight-500 dark:s-bg-highlight-500-night";
        case "blocked":
          return "s-bg-golden-500 dark:s-bg-golden-500-night";
        default:
          return "";
      }
    };

    const shouldShowStatusDot = status !== "idle";

    return (
      <div
        className={cn("s-group/menu-item s-relative", className)}
        ref={ref}
        data-nav="menu-button"
        data-selected={selected}
        {...props}
      >
        <LinkWrapper
          href={href}
          target={target}
          rel={rel}
          replace={replace}
          shallow={shallow}
        >
          <div
            className={cn(
              "s-peer/menu-button",
              NavigationListItemStyles({
                state: selected
                  ? "selected"
                  : isPressed
                    ? "active"
                    : "unselected",
              })
            )}
            onMouseLeave={() => {
              setIsPressed(false);
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={() => setIsPressed(false)}
          >
            {shouldShowStatusDot && (
              <div
                className={cn(
                  "s-h-2 s-w-2 s-flex-shrink-0 s-rounded-full",
                  getStatusDotColor()
                )}
              />
            )}
            {icon && <Icon visual={icon} size="sm" />}
            {avatar}
            {label && (
              <span className="s-grow s-overflow-hidden s-text-ellipsis s-whitespace-nowrap group-hover/menu-item:s-pr-7 group-data-[selected=true]/menu-item:s-pr-7">
                {label}
              </span>
            )}
          </div>
        </LinkWrapper>
        {moreMenu && <>{moreMenu}</>}
      </div>
    );
  }
);
NavigationListItem.displayName = "NavigationListItem";

interface NavigationListItemActionProps extends React.HTMLAttributes<HTMLDivElement> {
  showOnHover?: boolean;
}

const NavigationListItemAction = React.forwardRef<
  HTMLDivElement,
  NavigationListItemActionProps
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "s-absolute s-right-2 s-top-1.5 s-opacity-0 s-transition-opacity",
        "s-opacity-0 group-focus-within/menu-item:s-opacity-100 group-hover/menu-item:s-opacity-100 group-data-[selected=true]/menu-item:s-opacity-100",
        className
      )}
      {...props}
    >
      <Button size="xmini" icon={MoreIcon} variant="ghost" />
    </div>
  );
});
NavigationListItemAction.displayName = "NavigationListItemAction";

const variantStyles = cva("", {
  variants: {
    variant: {
      primary: "s-text-foreground dark:s-text-foreground-night",
      secondary: "s-text-muted-foreground dark:s-text-muted-foreground-night",
    },
    isSticky: {
      true: cn(
        "s-sticky s-top-0 s-z-10 s-bg-background dark:s-bg-muted-background-night",
        "s-border-border dark:s-border-border-night"
      ),
    },
  },
  defaultVariants: {
    variant: "primary",
    isSticky: false,
  },
});

const labelStyles = cva(
  "s-flex s-items-center s-justify-between s-gap-2 s-pt-4 s-pb-2 s-pr-2 s-heading-xs s-whitespace-nowrap s-overflow-hidden s-text-ellipsis"
);

interface NavigationListLabelProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof variantStyles> {
  label: string;
  action?: React.ReactNode;
}

const NavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListLabelProps
>(({ className, variant, label, isSticky, action, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      labelStyles(),
      variantStyles({ variant, isSticky }),
      "s-pl-3",
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

interface NavigationListCollapsibleSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const collapseableStyles = cva(
  cn(
    "s-py-2 s-mt-2 s-px-2.5",
    "s-heading-xs s-whitespace-nowrap s-overflow-hidden s-text-ellipsis ",
    "s-box-border s-flex s-items-center s-w-full s-gap-1.5",
    "s-cursor-pointer s-select-none",
    "s-outline-none s-rounded-xl s-transition-colors s-duration-300",
    "data-[disabled]:s-pointer-events-none",
    "data-[disabled]:s-text-muted-foreground dark:data-[disabled]:s-text-muted-foreground-night",
    "hover:s-text-foreground dark:hover:s-text-foreground-night",
    "hover:s-bg-primary-100 dark:hover:s-bg-primary-200-night"
  ),
  {
    variants: {
      state: {
        active: "active:s-bg-primary-150 dark:active:s-bg-primary-200-night",
        selected: cn(
          "s-text-foreground dark:s-text-foreground-night",
          "s-bg-primary-100 dark:s-bg-primary-200-night"
        ),
        unselected:
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
      },
    },
    defaultVariants: {
      state: "unselected",
    },
  }
);

const NavigationListCollapsibleSection = React.forwardRef<
  React.ElementRef<typeof Collapsible>,
  NavigationListCollapsibleSectionProps
>(({ label, action, children, className, ...props }) => {
  return (
    <Collapsible className={className} {...props}>
      <div className="s-group/menu-item s-relative">
        <CollapsibleTrigger>
          <div className={collapseableStyles({ state: "unselected" })}>
            {label}
          </div>
        </CollapsibleTrigger>
        {action && (
          <div
            className={cn(
              "s-absolute s-bottom-1 s-right-1.5 s-flex s-gap-1 s-opacity-0 s-transition-opacity",
              "hover:s-opacity-100 group-focus-within/menu-item:s-opacity-100 group-hover/menu-item:s-opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {action}
          </div>
        )}
      </div>
      <CollapsibleContent>
        <div className="s-flex s-flex-col s-gap-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
});

NavigationListCollapsibleSection.displayName =
  "NavigationListCollapsibleSection";

export {
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
};
