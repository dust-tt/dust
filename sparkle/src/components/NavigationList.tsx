import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Button } from "@sparkle/components/Button";
import {
  Collapsible,
  CollapsibleContent,
} from "@sparkle/components/Collapsible";
import {
  Icon,
  LinkWrapper,
  LinkWrapperProps,
  ScrollArea,
  ScrollBar,
} from "@sparkle/components/";
import { ArrowDownSIcon, ArrowRightSIcon, MoreIcon } from "@sparkle/icons/app";
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
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<LinkWrapperProps, "children" | "className"> {
  selected?: boolean;
  label?: string;
  icon?: React.ComponentType;
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
            {label && (
              <span className="s-grow s-overflow-hidden s-text-ellipsis s-whitespace-nowrap group-hover/menu-item:s-pr-8 group-data-[selected=true]/menu-item:s-pr-8">
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

interface NavigationListItemActionProps
  extends React.HTMLAttributes<HTMLDivElement> {
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
        "s-absolute s-right-1.5 s-top-1 s-opacity-0 s-transition-opacity",
        "s-opacity-0 group-focus-within/menu-item:s-opacity-100 group-hover/menu-item:s-opacity-100 group-data-[selected=true]/menu-item:s-opacity-100",
        className
      )}
      {...props}
    >
      <Button size="mini" icon={MoreIcon} variant="ghost" />
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
  "s-flex s-items-center s-justify-between s-gap-2 s-pt-4 s-pb-2 s-heading-xs s-whitespace-nowrap s-overflow-hidden s-text-ellipsis"
);

interface NavigationListLabelButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ComponentType;
  children?: React.ReactNode;
}

const NavigationListLabelButton = React.forwardRef<
  HTMLButtonElement,
  NavigationListLabelButtonProps
>(({ className, icon, children, disabled, ...props }, ref) => {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      className={cn(
        "s-inline-flex s-flex-shrink-0 s-items-center s-justify-center",
        "s-rounded-md s-transition-colors s-duration-200",
        "s-text-muted-foreground dark:s-text-muted-foreground-night",
        "hover:s-text-foreground dark:hover:s-text-foreground-night",
        "hover:s-bg-primary-150 dark:hover:s-bg-primary-150-night",
        "active:s-bg-primary-200 dark:active:s-bg-primary-200-night",
        "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-1",
        "disabled:s-cursor-not-allowed disabled:s-opacity-50",
        "disabled:hover:s-text-muted-foreground dark:disabled:hover:s-text-muted-foreground-night",
        "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent",
        className
      )}
      {...props}
    >
      {icon ? <Icon visual={icon} size="xs" /> : children}
    </button>
  );
});

NavigationListLabelButton.displayName = "NavigationListLabelButton";

interface NavigationListLabelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof variantStyles> {
  label: string;
  isCollapsible?: boolean;
  isOpen?: boolean;
  action?: React.ReactNode;
}

const NavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListLabelProps
>(
  (
    {
      className,
      variant,
      label,
      isSticky,
      isCollapsible,
      isOpen,
      action,
      ...props
    },
    ref
  ) => (
    <div
      ref={ref}
      className={cn(
        labelStyles(),
        variantStyles({ variant, isSticky }),
        isCollapsible ? "s-pl-1.5" : "s-pl-3",
        className
      )}
      {...props}
    >
      <div className="s-flex s-items-center s-gap-1 s-overflow-hidden s-text-ellipsis">
        {isCollapsible && (
          <NavigationListLabelButton
            icon={isOpen ? ArrowDownSIcon : ArrowRightSIcon}
            aria-label={isOpen ? "Collapse section" : "Expand section"}
          />
        )}
        <span className="s-overflow-hidden s-text-ellipsis">{label}</span>
      </div>
      {action}
    </div>
  )
);

NavigationListLabel.displayName = "NavigationListLabel";

interface NavigationListCollapsibleSectionProps
  extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  action?: React.ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const NavigationListCollapsibleSection = React.forwardRef<
  React.ElementRef<typeof Collapsible>,
  NavigationListCollapsibleSectionProps
>(
  (
    {
      label,
      action,
      defaultOpen,
      open,
      onOpenChange,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const [internalOpen, setInternalOpen] = React.useState(
      defaultOpen ?? false
    );
    const isControlled = open !== undefined;
    const isOpen = isControlled ? open : internalOpen;

    const handleOpenChange = (newOpen: boolean) => {
      if (!isControlled) {
        setInternalOpen(newOpen);
      }
      onOpenChange?.(newOpen);
    };

    return (
      <Collapsible
        ref={ref}
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={className}
        {...props}
      >
        <CollapsiblePrimitive.Trigger asChild>
          <NavigationListLabel
            label={label}
            isCollapsible={true}
            isOpen={isOpen}
            action={action}
          />
        </CollapsiblePrimitive.Trigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    );
  }
);

NavigationListCollapsibleSection.displayName =
  "NavigationListCollapsibleSection";

export {
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListCollapsibleSection,
  NavigationListLabel,
  NavigationListLabelButton,
};
