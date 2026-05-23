import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Icon } from "@sparkle/components/Icon";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

const NavTabPill = TabsPrimitive.Root;

const NavTabPillList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "s-inline-flex s-items-center s-justify-center s-gap-1 s-rounded-lg",
      className
    )}
    {...props}
  />
));
NavTabPillList.displayName = TabsPrimitive.List.displayName;

interface NavTabPillTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    Omit<LinkWrapperProps, "children" | "className"> {
  icon: React.ComponentType<{ className?: string }>;
  easingClassName?: {
    trigger?: string;
    grid?: string;
  };
}

const NavTabPillTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  NavTabPillTriggerProps
>(({ className, icon, children, href, target, rel, replace, shallow, easingClassName, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "s-group s-inline-flex s-h-8 s-items-center s-justify-center s-whitespace-nowrap s-rounded-lg s-pl-2 [&:not([data-state=active])]:s-pr-2 s-text-sm",
      "s-text-muted-foreground dark:s-text-muted-foreground-night",
      "hover:s-bg-sidebar-100 hover:s-text-foreground dark:hover:s-bg-sidebar-100-night dark:hover:s-text-foreground-night",
      "s-font-medium",
      "s-bg-transparent",
      "data-[state=active]:s-bg-sidebar-100 data-[state=active]:s-text-foreground",
      "dark:data-[state=active]:s-bg-sidebar-100-night dark:data-[state=active]:s-text-foreground-night",
      "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2",
      "disabled:s-pointer-events-none disabled:s-opacity-100",
      "",
      easingClassName?.trigger ?? "s-ease-out-quint",
      className
    )}
    {...props}
  >
    <LinkWrapper href={href} target={target} rel={rel} replace={replace} shallow={shallow}>
      <Icon visual={icon} size="xs" />
      <div className={cn(
        "s-relative s-grid s-grid-cols-[0fr] s-transition-[grid-template-columns] s-duration-300 group-data-[state=active]:s-grid-cols-[1fr] s-ease-out-quad overflow-hidden",
        easingClassName?.grid ?? "s-ease-out"
      )}>
        <span
          className="s-overflow-hidden s-min-w-0"
          style={{
            maskImage:
              "linear-gradient(to right, black calc(100% - 8px), transparent)",
          }}
        >
          <span className="group-data-[state=active]:s-pl-1.5 group-data-[state=active]:s-pr-2 s-transition-[padding] s-duration-300 s-ease-out-quad s-whitespace-nowrap">{children}</span>
        </span>
      </div>
    </LinkWrapper>
  </TabsPrimitive.Trigger>
));
NavTabPillTrigger.displayName = TabsPrimitive.Trigger.displayName;

const NavTabPillContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "s-mt-2 focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2",
      className
    )}
    {...props}
  />
));
NavTabPillContent.displayName = TabsPrimitive.Content.displayName;

export { NavTabPill, NavTabPillContent, NavTabPillList, NavTabPillTrigger };
