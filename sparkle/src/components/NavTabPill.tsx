import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Icon } from "@sparkle/components/Icon";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

const NavTabPill = TabsPrimitive.Root;

const NavTabPillList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("s:flex s:items-center s:gap-1.5", className)}
    {...props}
  />
));
NavTabPillList.displayName = TabsPrimitive.List.displayName;

interface NavTabPillTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    Omit<LinkWrapperProps, "children" | "className"> {
  icon: React.ComponentType<{ className?: string }>;
}

const NavTabPillTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  NavTabPillTriggerProps
>(
  (
    {
      className,
      icon,
      children,
      href,
      target,
      rel,
      replace,
      shallow,
      ...props
    },
    ref
  ) => {
    const triggerClassName = cn(
      "s:group s:flex s:h-8 s:items-center s:justify-center s:whitespace-nowrap s:rounded-lg s:pl-2 s:group-data-[state=active]:pl-2.5 s:[&:not([data-state=active])]:pr-2 s:text-sm",
      "s:text-muted-foreground s:dark:text-muted-foreground-night",
      "s:hover:bg-sidebar-foreground s:dark:hover:bg-sidebar-foreground-night",
      "s:font-medium",
      "s:bg-transparent",
      "s:data-[state=active]:bg-sidebar-foreground s:data-[state=active]:text-foreground",
      "s:dark:data-[state=active]:bg-sidebar-foreground-night s:dark:data-[state=active]:text-foreground-night",
      "s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-ring s:focus-visible:ring-offset-2",
      "s:disabled:pointer-events-none s:disabled:opacity-100",
      "s:data-[state=active]:overflow-hidden s:data-[state=active]:shrink",
      "s:transition-[padding] s:duration-200 s:motion-reduce:transition-none",
      "s:touch-hitbox",
      className
    );

    const iconElement = children ? (
      <TooltipProvider>
        <TooltipRoot disableHoverableContent>
          <TooltipTrigger asChild>
            <span className="s:flex s:items-center s:justify-center s:group-data-[state=active]:pointer-events-none">
              <Icon visual={icon} size="sm" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="s:group-data-[state=active]:hidden">
            {children}
          </TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    ) : (
      <Icon visual={icon} size="sm" />
    );

    const content = (
      <>
        {iconElement}
        <div
          className={cn(
            "s:relative s:grid s:grid-cols-[0fr] s:transition-[grid-template-columns] s:duration-200 s:group-data-[state=active]:grid-cols-[1fr] s:overflow-hidden s:motion-reduce:transition-none"
          )}
        >
          <span
            className="s:overflow-hidden s:min-w-0"
            style={{
              maskImage:
                "linear-gradient(to right, black calc(100% - 8px), transparent)",
            }}
          >
            <span className="s:group-data-[state=active]:pl-1.5 s:group-data-[state=active]:opacity-100 s:group-data-[state=inactive]:opacity-0 s:group-data-[state=active]:pr-2.5 s:whitespace-nowrap">
              {children}
            </span>
          </span>
        </div>
      </>
    );

    if (href) {
      return (
        <TabsPrimitive.Trigger ref={ref} asChild {...props}>
          <LinkWrapper
            href={href}
            target={target}
            rel={rel}
            replace={replace}
            className={triggerClassName}
          >
            {content}
          </LinkWrapper>
        </TabsPrimitive.Trigger>
      );
    }

    return (
      <TabsPrimitive.Trigger ref={ref} className={triggerClassName} {...props}>
        {content}
      </TabsPrimitive.Trigger>
    );
  }
);
NavTabPillTrigger.displayName = TabsPrimitive.Trigger.displayName;

const NavTabPillContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-ring s:focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
NavTabPillContent.displayName = TabsPrimitive.Content.displayName;

export { NavTabPill, NavTabPillContent, NavTabPillList, NavTabPillTrigger };
