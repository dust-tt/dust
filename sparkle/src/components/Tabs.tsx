import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { NewButton } from "@sparkle/components";
import { classNames } from "@sparkle/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={classNames(
      "s-inline-flex s-h-10 s-items-center s-gap-2 s-border-b s-border-separator",
      className ? className : ""
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    label?: string;
    icon?: React.ComponentType;
    isLoading?: boolean;
  }
>(({ className, label, icon, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={classNames(
      "s-border s-border-0 s-border-b-2 s-border-primary-800/0 s-pb-1 disabled:s-pointer-events-none data-[state=active]:s-border-primary-800",
      className ? className : ""
    )}
    {...props}
  >
    <NewButton variant="ghost" size="sm" label={label} icon={icon} />
  </TabsPrimitive.Trigger>
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={classNames(
      "focus-visible:s-ring-ring s-contents s-ring-offset-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2",
      className ? className : ""
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
