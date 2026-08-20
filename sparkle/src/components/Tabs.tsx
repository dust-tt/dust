import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Button } from "@sparkle/components/Button";
import type { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

/**
 * Switches between sibling views within the same region, built on Radix Tabs. Compose it
 * from `Tabs` (root, controlled via `value`/`defaultValue`), `TabsList`, `TabsTrigger`,
 * and `TabsContent`, pairing each trigger with a content panel sharing the same `value`.
 * Use it to organize related content into peer views toggled without leaving the page;
 * for pill-styled, sidebar-oriented section switching, use `NavTabPill` instead.
 *
 * @summary Tabbed view switcher.
 */
const Tabs = TabsPrimitive.Root;

const tabsTriggerVariants = cva(
  [
    "relative",
    "after:absolute after:bottom-[-10px] after:left-1/2 after:h-[2px]",
    "after:w-full after:-translate-x-1/2",
    "after:bg-foreground after:opacity-0 data-[state=active]:after:opacity-100",
  ],
  {
    variants: {
      variant: {
        ghost:
          "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-primary-900",
        primary: "",
        highlight: "",
        "highlight-secondary": "",
        "highlight-ghost": "",
        warning: "",
        "warning-secondary": "",
        "warning-ghost": "",
        outline: "",
        "ghost-secondary": "",
      },
    },
  }
);

const tabsListVariants = cva("flex h-11 gap-2 w-full", {
  variants: {
    border: {
      true: "border-b border-border",
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
    <ScrollBar orientation="horizontal" className="hidden" />
  </ScrollArea>
));
TabsList.displayName = TabsPrimitive.List.displayName;

/**
 * A single tab button rendered as a Sparkle `Button`, with a `label`, optional `icon`,
 * and a `tooltip` — always provide the tooltip for icon-only triggers so they remain
 * identifiable. Supports link navigation props (`href`, `target`, ...) and counters.
 *
 * @summary Tab trigger button.
 */
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
        className={cn("disabled:pointer-events-none", className)}
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
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "contents ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
