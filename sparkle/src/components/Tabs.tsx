/** biome-ignore-all lint/nursery/noImportCycles: I'm too lazy to fix that now */

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { ScrollArea, ScrollBar } from "@sparkle/components/";
import { Button } from "@sparkle/components/Button";
import type { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const Tabs = TabsPrimitive.Root;

const tabsTriggerVariants = cva(
  [
    "s-relative",
    "after:s-absolute after:s-bottom-[-10px] after:s-left-1/2 after:s-h-[2px]",
    "after:s-w-full after:s--translate-x-1/2",
    "after:s-bg-foreground after:s-opacity-0 data-[state=active]:after:s-opacity-100",
    "dark:after:s-bg-foreground-night",
  ],
  {
    variants: {
      variant: {
        ghost:
          "data-[state=inactive]:s-text-muted-foreground data-[state=inactive]:hover:s-text-primary-900 data-[state=inactive]:dark:s-text-muted-foreground-night data-[state=inactive]:dark:hover:s-text-primary-900-night",
        primary: "",
        highlight: "",
        "highlight-secondary": "",
        warning: "",
        "warning-secondary": "",
        outline: "",
        "ghost-secondary": "",
      },
    },
  }
);

const tabsListVariants = cva("s-flex s-h-[45px] s-gap-2 s-w-full", {
  variants: {
    border: {
      true: "s-border-b s-border-border dark:s-border-border-night",
    },
  },
  defaultVariants: {
    border: true,
  },
});

type TabsListProps = React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, border, ...props }, ref) => (
  <ScrollArea>
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabsListVariants({ border }), className)}
      {...props}
    />
    <ScrollBar orientation="horizontal" className="s-hidden" />
  </ScrollArea>
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> &
    Partial<
      Pick<
        React.ComponentProps<typeof Button>,
        "label" | "tooltip" | "icon" | "isCounter" | "counterValue" | "variant"
      >
    > & {
      isLoading?: boolean;
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
      variant = "ghost",
      isCounter = false,
      counterValue,
      ...props
    },
    ref
  ) => {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cn("disabled:s-pointer-events-none", className)}
        disabled={disabled}
        asChild
        {...props}
      >
        <Button
          variant={variant}
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
          isCounter={isCounter}
          counterValue={counterValue}
          className={cn(
            tabsTriggerVariants({ variant: variant ?? undefined }),
            className
          )}
        />
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
