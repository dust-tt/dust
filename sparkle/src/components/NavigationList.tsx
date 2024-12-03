import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { Icon, LinkWrapper, LinkWrapperProps } from "@sparkle/components/";
import { MiniButton } from "@sparkle/components/Button";
import { MoreIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const listStyles = cva("s-flex", {
  variants: {
    layout: {
      container: "s-gap-1 s-flex-col s-overflow-hidden",
      item: cn(
        "s-box-border s-items-center s-w-full s-flex s-gap-1.5 s-cursor-pointer s-select-none s-items-center s-outline-none s-rounded-xl s-text-sm s-px-3 s-py-2 s-transition-colors s-duration-300",
        "data-[disabled]:s-pointer-events-none data-[disabled]:s-text-muted-foreground",
        "hover:s-text-foreground hover:s-bg-structure-150"
      ),
    },
    state: {
      active: "active:s-bg-structure-200",
      selected: "s-text-foreground s-font-medium s-bg-structure-150",
      unselected: "s-text-muted-foreground",
    },
  },
  defaultVariants: {
    layout: "container",
    state: "unselected",
  },
});

const labelStyles = cva(
  "s-font-semibold s-pt-6 s-pb-2 s-text-xs s-whitespace-nowrap s-overflow-hidden s-text-ellipsis"
);

const NavigationList = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(listStyles({ layout: "container" }), className)}
    {...props}
  />
));
NavigationList.displayName = "NavigationList";

interface NavigationListItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    Omit<LinkWrapperProps, "children" | "className"> {
  selected?: boolean;
  label?: string;
  icon?: React.ComponentType;
  moreMenu?: React.ReactNode;
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
              listStyles({
                layout: "item",
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
      <MiniButton icon={MoreIcon} variant={"ghost"} />
    </div>
  );
});
NavigationListItemAction.displayName = "NavigationListItemAction";

const variantStyles = cva("", {
  variants: {
    variant: {
      primary: "s-text-foreground",
      secondary: "s-text-muted-foreground",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
});

interface NavigationListLabelProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof variantStyles> {
  label: string;
}

const NavigationListLabel = React.forwardRef<
  HTMLDivElement,
  NavigationListLabelProps
>(({ className, variant, label, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(labelStyles(), variantStyles({ variant }), className)}
    {...props}
  >
    {label}
  </div>
));

NavigationListLabel.displayName = "NavigationListLabel";

// const SidebarMenuButton = React.forwardRef<
//   HTMLButtonElement,
//   React.ComponentProps<"button"> & {
//     asChild?: boolean;
//     isActive?: boolean;
//     tooltip?: string | React.ComponentProps<typeof TooltipContent>;
//   }
// >(
//   (
//     { asChild = false, isActive = false, tooltip, className, ...props },
//     ref
//   ) => {
//     const Comp = asChild ? Slot : "button";
//     const { isMobile, state } = useSidebar();

//     const button = (
//       <Comp
//         ref={ref}
//         data-sidebar="menu-button"
//         data-active={isActive}
//         className={cn(
//           "s-peer/menu-button",
//           "s-flex s-w-full s-items-center s-gap-3",
//           "s-rounded-lg s-p-2 s-text-left s-text-sm s-font-medium s-text-foreground",
//           "hover:s-text-sidebar-accent-foreground hover:s-bg-primary-100",
//           "focus-visible:s-ring-2",
//           "active:bg-sidebar-accent active:text-sidebar-accent-foreground",
//           "disabled:pointer-events-none disabled:opacity-50",
//           "s-transition s-duration-300",
//           "s-ring-sidebar-ring s-group-has-[[data-sidebar=menu-action]]/menu-item:s-pr-8 s-aria-disabled:pointer-events-none s-aria-disabled:opacity-50 s-overflow-hidden s-outline-none",
//           "s-data-[active=true]:bg-sidebar-accent s-data-[active=true]:font-medium s-data-[active=true]:text-sidebar-accent-foreground s-data-[state=open]:hover:bg-sidebar-accent s-data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!s-size-8 [&>svg]:s-size-4 group-data-[collapsible=icon]:!s-p-2 [&>span:last-child]:s-truncate [&>svg]:s-shrink-0",
//           className
//         )}
//         {...props}
//       />
//     );

//     if (!tooltip) {
//       return button;
//     }

//     if (typeof tooltip === "string") {
//       tooltip = {
//         children: tooltip,
//       };
//     }

//     return (
//       <TooltipRoot>
//         <TooltipTrigger asChild>{button}</TooltipTrigger>
//         <TooltipContent
//           side="right"
//           align="center"
//           hidden={state !== "collapsed" || isMobile}
//           {...tooltip}
//         />
//       </TooltipRoot>
//     );
//   }
// );
// SidebarMenuButton.displayName = "SidebarMenuButton";

export {
  NavigationList,
  NavigationListItem,
  NavigationListItemAction,
  NavigationListLabel,
};
