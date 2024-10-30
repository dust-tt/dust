import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";

import { Button, LinkWrapper, LinkWrapperProps } from "@sparkle/components";
import { cn } from "@sparkle/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "s-inline-flex s-h-10 s-items-center s-gap-2 s-border-b s-border-separator",
      className
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
  } & Omit<LinkWrapperProps, "children" | "className">
>(
  (
    { className, label, icon, href, target, rel, replace, shallow, ...props },
    ref
  ) => {
    const content = (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          "s-border-0 s-border-b-2 s-border-primary-800/0 s-pb-1 disabled:s-pointer-events-none data-[state=active]:s-border-primary-800",
          className
        )}
        asChild
        {...props}
      >
        <div>
          <Button variant="ghost" size="sm" label={label} icon={icon} />
        </div>
      </TabsPrimitive.Trigger>
    );

    return (
      <LinkWrapper
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
      >
        {content}
      </LinkWrapper>
    );
  }
);

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "s-contents s-ring-offset-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
