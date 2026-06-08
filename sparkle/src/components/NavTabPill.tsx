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
    className={cn("s-flex s-items-center s-gap-1.5", className)}
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
      "s-group s-flex s-h-8 s-items-center s-justify-center s-whitespace-nowrap s-rounded-lg s-pl-2 group-data-[state=active]:s-pl-2.5 [&:not([data-state=active])]:s-pr-2 s-text-sm",
      "s-text-muted-foreground dark:s-text-muted-foreground-night",
      "hover:s-bg-gray-100 dark:hover:s-bg-gray-200-night",
      "s-font-medium",
      "s-bg-transparent",
      "data-[state=active]:s-bg-gray-100 data-[state=active]:s-text-foreground",
      "dark:data-[state=active]:s-bg-gray-200-night dark:data-[state=active]:s-text-foreground-night",
      "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2",
      "disabled:s-pointer-events-none disabled:s-opacity-100",
      "data-[state=active]:s-overflow-hidden data-[state=active]:s-shrink",
      "s-transition-[padding] s-duration-200 motion-reduce:s-transition-none",
      className
    );

    const iconElement = children ? (
      <TooltipProvider>
        <TooltipRoot disableHoverableContent>
          <TooltipTrigger asChild>
            <span className="s-flex s-items-center s-justify-center group-data-[state=active]:s-pointer-events-none">
              <Icon visual={icon} size="sm" />
            </span>
          </TooltipTrigger>
          <TooltipContent className="group-data-[state=active]:s-hidden">
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
            "s-relative s-grid s-grid-cols-[0fr] s-transition-[grid-template-columns] s-duration-200 group-data-[state=active]:s-grid-cols-[1fr] s-overflow-hidden motion-reduce:s-transition-none",
          )}
        >
          <span
            className="s-overflow-hidden s-min-w-0"
            style={{
              maskImage:
                "linear-gradient(to right, black calc(100% - 8px), transparent)",
            }}
          >
            <span className="group-data-[state=active]:s-pl-1.5 group-data-[state=active]:s-opacity-1 group-data-[state=inactive]:s-opacity-0 group-data-[state=active]:s-pr-2.5 s-whitespace-nowrap">
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
      "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2",
      className
    )}
    {...props}
  />
));
NavTabPillContent.displayName = TabsPrimitive.Content.displayName;

export { NavTabPill, NavTabPillContent, NavTabPillList, NavTabPillTrigger };
