import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import {
  Button,
  Icon,
  Input,
  LoadingBlock,
  Separator,
  Sheet,
  SheetContent,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components";
import { ChevronDoubleLeftIcon, MoreIcon } from "@sparkle/icons";
import { cn, useIsMobile } from "@sparkle/lib/utils";

const SIDEBAR_COOKIE_NAME = "sidebar:state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_MOBILE = "18rem";
const SIDEBAR_WIDTH_ICON = "3rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContext = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

const SidebarContext = React.createContext<SidebarContext | null>(null);

function useSidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }

  return context;
}

const SidebarProvider = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }
>(
  (
    {
      defaultOpen = true,
      open: openProp,
      onOpenChange: setOpenProp,
      className,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isMobile = useIsMobile();
    const [openMobile, setOpenMobile] = React.useState(false);

    const [_open, _setOpen] = React.useState(defaultOpen);
    const open = openProp ?? _open;
    const setOpen = React.useCallback(
      (value: boolean | ((value: boolean) => boolean)) => {
        if (setOpenProp) {
          return setOpenProp?.(
            typeof value === "function" ? value(open) : value
          );
        }

        _setOpen(value);

        document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
      },
      [setOpenProp, open]
    );

    const toggleSidebar = React.useCallback(() => {
      return isMobile
        ? setOpenMobile((open) => !open)
        : setOpen((open) => !open);
    }, [isMobile, setOpen, setOpenMobile]);

    React.useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        if (
          event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
          (event.metaKey || event.ctrlKey)
        ) {
          event.preventDefault();
          toggleSidebar();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggleSidebar]);

    const state = open ? "expanded" : "collapsed";

    const contextValue = React.useMemo<SidebarContext>(
      () => ({
        state,
        open,
        setOpen,
        isMobile,
        openMobile,
        setOpenMobile,
        toggleSidebar,
      }),
      [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
    );

    return (
      <SidebarContext.Provider value={contextValue}>
        <TooltipProvider delayDuration={0}>
          <div
            style={
              {
                "240px": SIDEBAR_WIDTH,
                "240px-icon": SIDEBAR_WIDTH_ICON,
                ...style,
              } as React.CSSProperties
            }
            className={cn(
              "s-group/sidebar-wrapper s-min-h-svh s-has-[[data-variant=inset]]:s-bg-structure-50 s-flex s-w-full",
              className
            )}
            ref={ref}
            {...props}
          >
            {children}
          </div>
        </TooltipProvider>
      </SidebarContext.Provider>
    );
  }
);
SidebarProvider.displayName = "SidebarProvider";

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    side?: "left" | "right";
    variant?: "sidebar" | "floating" | "inset";
    collapsible?: "offcanvas" | "icon" | "none";
  }
>(
  (
    {
      side = "left",
      variant = "sidebar",
      collapsible = "offcanvas",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

    if (collapsible === "none") {
      return (
        <div
          className={cn(
            "s-flex s-h-full s-w-[240px] s-flex-col s-bg-structure-50 s-text-foreground",
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </div>
      );
    }

    if (isMobile) {
      return (
        <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
          <SheetContent
            data-sidebar="sidebar"
            data-mobile="true"
            className="s-w-[240px] s-bg-structure-50 s-p-0 s-text-foreground [&>button]:s-hidden"
            style={
              {
                "240px": SIDEBAR_WIDTH_MOBILE,
              } as React.CSSProperties
            }
            side={side}
          >
            <div className="s-flex s-h-full s-w-full s-flex-col">
              {children}
            </div>
          </SheetContent>
        </Sheet>
      );
    }

    return (
      <div
        ref={ref}
        className="s-group s-peer s-hidden s-text-foreground md:s-block"
        data-state={state}
        data-collapsible={state === "collapsed" ? collapsible : ""}
        data-variant={variant}
        data-side={side}
      >
        <div
          className={cn(
            "s-h-svh s-relative s-w-[240px] s-bg-transparent s-transition-[width] s-duration-200 s-ease-linear",
            "group-data-[collapsible=offcanvas]:s-w-0",
            "group-data-[side=right]:s-rotate-180",
            variant === "floating" || variant === "inset"
              ? "group-data-[collapsible=icon]:s-w-[calc(var(240px-icon)_+_theme(spacing.4))]"
              : "group-data-[collapsible=icon]:s-w-[240px-icon]"
          )}
        />
        <div
          className={cn(
            "s-h-svh s-fixed s-inset-y-0 s-z-10 s-hidden s-w-[240px] s-transition-[left,right,width] s-duration-200 s-ease-linear md:s-flex",
            side === "left"
              ? "s-left-0 group-data-[collapsible=offcanvas]:s-left-[calc(var(240px)*-1)]"
              : "s-right-0 group-data-[collapsible=offcanvas]:s-right-[calc(var(240px)*-1)]",
            variant === "floating" || variant === "inset"
              ? "s-p-2 group-data-[collapsible=icon]:s-w-[calc(var(240px-icon)_+_theme(spacing.4)_+2px)]"
              : "group-data-[collapsible=icon]:s-w-[240px-icon] group-data-[side=left]:s-border-r group-data-[side=right]:s-border-l",
            className
          )}
          {...props}
        >
          <div
            data-sidebar="sidebar"
            className="group-data-[variant=floating]:s-border-sidebar-border s-flex s-h-full s-w-full s-flex-col s-bg-structure-50 group-data-[variant=floating]:s-rounded-lg group-data-[variant=floating]:s-border group-data-[variant=floating]:s-shadow"
          >
            {children}
          </div>
        </div>
      </div>
    );
  }
);
Sidebar.displayName = "Sidebar";

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.ComponentProps<typeof Button>
>(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      variant="ghost"
      icon={ChevronDoubleLeftIcon}
      size="icon"
      className={cn("s-h-7 s-w-7", className)}
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      {...props}
    />
  );
});
SidebarTrigger.displayName = "SidebarTrigger";

const SidebarRail = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button">
>(({ className, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "hover:after:s-bg-structure-50-border s-absolute s-inset-y-0 s-z-20 s-hidden s-w-4 s-translate-x-1/2 s-transition-all s-ease-linear after:s-absolute after:s-inset-y-0 after:s-left-1/2 after:s-w-[2px] group-data-[side=left]:s-right-4 group-data-[side=right]:s-left-0 sm:s-flex",
        "[[data-side=left]_&]:s-cursor-w-resize [[data-side=right]_&]:s-cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:s-cursor-e-resize [[data-side=right][data-state=collapsed]_&]:s-cursor-w-resize",
        "group-data-[collapsible=offcanvas]:s-translate-x-0 group-data-[collapsible=offcanvas]:after:s-left-full group-data-[collapsible=offcanvas]:hover:s-bg-structure-50",
        "[[data-side=left][data-collapsible=offcanvas]_&]:s-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:s-left-2",
        className
      )}
      {...props}
    />
  );
});
SidebarRail.displayName = "SidebarRail";

const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => {
  return (
    <main
      ref={ref}
      className={cn(
        "s-min-h-svh s-relative s-flex s-flex-1 s-flex-col s-bg-background",
        "peer-data-[variant=inset]:s-min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:s-m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:s-ml-2 md:peer-data-[variant=inset]:s-ml-0 md:peer-data-[variant=inset]:s-rounded-xl md:peer-data-[variant=inset]:s-shadow",
        className
      )}
      {...props}
    />
  );
});
SidebarInset.displayName = "SidebarInset";

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  return (
    <Input
      ref={ref}
      data-sidebar="input"
      className={cn(
        "focus-visible:s-ring-sidebar-ring s-h-8 s-w-full s-bg-background s-shadow-none focus-visible:s-ring-2",
        className
      )}
      {...props}
    />
  );
});
SidebarInput.displayName = "SidebarInput";

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="header"
      className={cn("s-flex s-flex-col s-gap-2 s-p-2", className)}
      {...props}
    />
  );
});
SidebarHeader.displayName = "SidebarHeader";

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="footer"
      className={cn("s-flex s-flex-col s-gap-2 s-p-2", className)}
      {...props}
    />
  );
});
SidebarFooter.displayName = "SidebarFooter";

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.ComponentProps<typeof Separator>
>(({ className, ...props }, ref) => {
  return (
    <Separator
      ref={ref}
      data-sidebar="separator"
      className={cn("s-mx-2 s-w-auto s-border-structure-100", className)}
      {...props}
    />
  );
});
SidebarSeparator.displayName = "SidebarSeparator";

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="content"
      className={cn(
        "s-flex s-min-h-0 s-flex-1 s-flex-col s-gap-2 s-overflow-auto group-data-[collapsible=icon]:s-overflow-hidden",
        className
      )}
      {...props}
    />
  );
});
SidebarContent.displayName = "SidebarContent";

const SidebarGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-sidebar="group"
      className={cn(
        "s-relative s-flex s-w-full s-min-w-0 s-flex-col s-p-2",
        className
      )}
      {...props}
    />
  );
});
SidebarGroup.displayName = "SidebarGroup";

const SidebarGroupLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "div";

  const r = React.useRef<HTMLDivElement>(null);

  return (
    <Comp
      ref={r}
      data-sidebar="group-label"
      className={cn(
        "s-text-sidebar-foreground/70 s-ring-sidebar-ring [&>svg]:s-size-4 s-flex s-h-8 s-shrink-0 s-items-center s-rounded-md s-px-2 s-text-xs s-font-medium s-outline-none s-transition-[margin,opa] s-duration-200 s-ease-linear focus-visible:s-ring-2 [&>svg]:s-shrink-0",
        "group-data-[collapsible=icon]:s-mt-8 group-data-[collapsible=icon]:s-opacity-0",
        className
      )}
      {...props}
    />
  );
});
SidebarGroupLabel.displayName = "SidebarGroupLabel";

const SidebarGroupAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-sidebar="group-action"
      className={cn(
        "s-text-sidebar-foreground s-ring-sidebar-ring hover:s-bg-structure-50-accent hover:s-text-sidebar-accent-foreground [&>svg]:s-size-4 s-absolute s-right-3 s-top-3.5 s-flex s-aspect-square s-w-5 s-items-center s-justify-center s-rounded-md s-p-0 s-outline-none s-transition-transform focus-visible:s-ring-2 [&>svg]:s-shrink-0",
        "after:s-absolute after:s-inset-2 after:md:s-hidden",
        "group-data-[collapsible=icon]:s-hidden",
        className
      )}
      {...props}
    />
  );
});
SidebarGroupAction.displayName = "SidebarGroupAction";

const SidebarGroupContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="group-content"
    className={cn("s-w-full s-text-sm", className)}
    {...props}
  />
));
SidebarGroupContent.displayName = "SidebarGroupContent";

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu"
    className={cn("s-flex s-w-full s-min-w-0 s-flex-col s-gap-1", className)}
    {...props}
  />
));
SidebarMenu.displayName = "SidebarMenu";

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ className, ...props }, ref) => (
  <li
    ref={ref}
    data-sidebar="menu-item"
    className={cn(
      "s-group/menu-item s-relative",
      // "s-flex s-cursor-pointer s-select-none s-items-center s-gap-2 s-rounded-md s-px-2 s-py-2 s-text-sm s-font-medium s-outline-none s-transition-colors s-duration-300 data-[disabled]:s-pointer-events-none data-[disabled]:s-text-primary-400",
      // "hover:s-bg-background hover:s-text-foreground",
      className
    )}
    {...props}
  />
));
SidebarMenuItem.displayName = "SidebarMenuItem";

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: string | React.ComponentProps<typeof TooltipContent>;
  }
>(
  (
    { asChild = false, isActive = false, tooltip, className, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const { isMobile, state } = useSidebar();

    const button = (
      <Comp
        ref={ref}
        data-sidebar="menu-button"
        data-active={isActive}
        className={cn(
          "s-peer/menu-button",
          "s-flex s-w-full s-items-center s-gap-3",
          "s-rounded-lg s-p-2 s-text-left s-text-sm s-font-medium s-text-foreground",
          "hover:s-text-sidebar-accent-foreground hover:s-bg-primary-100",
          "focus-visible:s-ring-2",
          "active:bg-sidebar-accent active:text-sidebar-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-50",
          "s-transition s-duration-300",
          "s-ring-sidebar-ring s-group-has-[[data-sidebar=menu-action]]/menu-item:s-pr-8 s-aria-disabled:pointer-events-none s-aria-disabled:opacity-50 s-overflow-hidden s-outline-none",
          "s-data-[active=true]:bg-sidebar-accent s-data-[active=true]:font-medium s-data-[active=true]:text-sidebar-accent-foreground s-data-[state=open]:hover:bg-sidebar-accent s-data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!s-size-8 [&>svg]:s-size-4 group-data-[collapsible=icon]:!s-p-2 [&>span:last-child]:s-truncate [&>svg]:s-shrink-0",
          className
        )}
        {...props}
      />
    );

    if (!tooltip) {
      return button;
    }

    if (typeof tooltip === "string") {
      tooltip = {
        children: tooltip,
      };
    }

    return (
      <TooltipRoot>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent
          side="right"
          align="center"
          hidden={state !== "collapsed" || isMobile}
          {...tooltip}
        />
      </TooltipRoot>
    );
  }
);
SidebarMenuButton.displayName = "SidebarMenuButton";

const SidebarMenuAction = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> & {
    asChild?: boolean;
    showOnHover?: boolean;
  }
>(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-action"
      className={cn(
        "s-text-sidebar-foreground s-ring-sidebar-ring",
        "s-absolute s-right-1.5 s-top-1.5 s-flex s-aspect-square s-w-6 s-items-center s-justify-center s-rounded-md s-p-0 s-outline-none s-transition-transform focus-visible:s-ring-2 [&>svg]:s-shrink-0",
        "hover:s-bg-primary-200 hover:s-text-muted-foreground",
        "after:s-absolute after:s-inset-2 after:md:s-hidden",
        "s-peer-hover/menu-button:text-sidebar-accent-foreground",
        "s-group-data-[collapsible=icon]:s-hidden",
        showOnHover &&
          "peer-data-[active=true]/menu-button:s-text-sidebar-accent-foreground group-focus-within/menu-item:s-opacity-100 group-hover/menu-item:s-opacity-100 data-[state=open]:s-opacity-100 md:s-opacity-0",
        className
      )}
      {...props}
    >
      <Icon visual={MoreIcon} />
    </Comp>
  );
});
SidebarMenuAction.displayName = "SidebarMenuAction";

const SidebarMenuBadge = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="menu-badge"
    className={cn(
      "s-min-w-5 s-text-sidebar-foreground s-pointer-events-none s-absolute s-right-1 s-flex s-h-5 s-select-none s-items-center s-justify-center s-rounded-md s-px-1 s-text-xs s-font-medium s-tabular-nums",
      "s-peer-hover/menu-button:s-text-sidebar-accent-foreground peer-data-[active=true]/menu-button:s-text-sidebar-accent-foreground",
      "peer-data-[size=sm]/menu-button:s-top-1",
      "peer-data-[size=default]/menu-button:s-top-1.5",
      "peer-data-[size=lg]/menu-button:s-top-2.5",
      "group-data-[collapsible=icon]:s-hidden",
      className
    )}
    {...props}
  />
));
SidebarMenuBadge.displayName = "SidebarMenuBadge";

const SidebarMenuLoadingBlock = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    showIcon?: boolean;
  }
>(({ className, showIcon = false, ...props }, ref) => {
  const width = React.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);

  return (
    <div
      ref={ref}
      data-sidebar="menu-LoadingBlock"
      className={cn(
        "s-flex s-h-8 s-items-center s-gap-2 s-rounded-md s-px-2",
        className
      )}
      {...props}
    >
      {showIcon && (
        <LoadingBlock
          className="s-size-4 s-rounded-md"
          data-sidebar="menu-LoadingBlock-icon"
        />
      )}
      <LoadingBlock
        className="s-h-4 s-max-w-[--LoadingBlock-width] s-flex-1"
        data-sidebar="menu-LoadingBlock-text"
        style={
          {
            "--LoadingBlock-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  );
});
SidebarMenuLoadingBlock.displayName = "SidebarMenuLoadingBlock";

const SidebarMenuSub = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<"ul">
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    data-sidebar="menu-sub"
    className={cn(
      "s-border-sidebar-border s-mx-3.5 s-flex s-min-w-0 s-translate-x-px s-flex-col s-gap-1 s-border-l s-px-2.5 s-py-0.5",
      "group-data-[collapsible=icon]:s-hidden",
      className
    )}
    {...props}
  />
));
SidebarMenuSub.displayName = "SidebarMenuSub";

const SidebarMenuSubItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<"li">
>(({ ...props }, ref) => <li ref={ref} {...props} />);
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";

const SidebarMenuSubButton = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<"a"> & {
    asChild?: boolean;
    size?: "sm" | "md";
    isActive?: boolean;
  }
>(({ asChild = false, size = "md", isActive, className, ...props }, ref) => {
  const Comp = asChild ? Slot : "a";

  return (
    <Comp
      ref={ref}
      data-sidebar="menu-sub-button"
      data-size={size}
      data-active={isActive}
      className={cn(
        "s-text-sidebar-foreground s-ring-sidebar-ring hover:s-bg-structure-50-accent hover:s-text-sidebar-accent-foreground s-active:bg-sidebar-accent s-active:text-sidebar-accent-foreground s-disabled:pointer-events-none s-disabled:opacity-50 s-aria-disabled:pointer-events-none s-aria-disabled:opacity-50 [&>svg]:s-size-4 [&>svg]:s-text-sidebar-accent-foreground s-flex s-h-7 s-min-w-0 s-translate-x-px s-items-center s-gap-2 s-overflow-hidden s-rounded-md s-px-2 s-outline-none focus-visible:s-ring-2 [&>span:last-child]:s-truncate [&>svg]:s-shrink-0",
        "s-data-[active=true]:s-bg-structure-50-accent s-data-[active=true]:s-text-sidebar-accent-foreground",
        size === "sm" && "s-text-xs",
        size === "md" && "s-text-sm",
        "group-data-[collapsible=icon]:s-hidden",
        className
      )}
      {...props}
    />
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuLoadingBlock,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
};
