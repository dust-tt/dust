import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, VariantProps } from "class-variance-authority";
import * as React from "react";

import { ScrollArea, ScrollBar } from "@sparkle/components/";
import { Button } from "@sparkle/components/Button";
import { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { cn } from "@sparkle/lib/utils";

const Tabs = TabsPrimitive.Root;

const tabsListVariants = cva("s-inline-flex s-h-11 s-gap-2", {
  variants: {
    size: {
      full: "s-w-full",
    },
    border: {
      true: "s-border-b s-border-primary-200/60 dark:s-border-primary-500/60",
    },
  },
  defaultVariants: {
    size: "full",
    border: true,
  },
});

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, size, border, ...props }, ref) => (
  <ScrollArea>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ size, border }), className)}
      {...props}
    />
    <ScrollBar orientation="horizontal" className="s-hidden" />
  </ScrollArea>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    label?: string;
    tooltip?: string;
    icon?: React.ComponentType;
    isLoading?: boolean;
    buttonVariant?: React.ComponentProps<typeof Button>["variant"];
  } & Omit<LinkWrapperProps, "children" | "className">
>(
  (
    {
      className,
      label,
      tooltip,
      icon,
      href,
      target,
      rel,
      replace,
      shallow,
      disabled,
      buttonVariant = "ghost",
      ...props
    },
    ref
  ) => {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn(
          "s-h-11",
          "dark:data-[state=active]:s-shadow-inner-border-night disabled:s-pointer-events-none data-[state=active]:s-shadow-inner-border",
          className
        )}
        disabled={disabled}
        asChild
        {...props}
      >
        <div>
          <Button
            variant={buttonVariant}
            size="sm"
            label={label}
            tooltip={tooltip}
            icon={icon}
            disabled={disabled}
            href={href}
            target={target}
            rel={rel}
            replace={replace}
            shallow={shallow}
          />
        </div>
      </TabsPrimitive.Trigger>
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
