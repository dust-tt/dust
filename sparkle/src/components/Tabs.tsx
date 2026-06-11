import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Button } from "@sparkle/components/Button";
import type { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import { ScrollArea, ScrollBar } from "@sparkle/components/ScrollArea";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const Tabs = TabsPrimitive.Root;

const tabsTriggerVariants = cva(
  [
    "s:relative",
    "s:after:absolute s:after:bottom-[-10px] s:after:left-1/2 s:after:h-[2px]",
    "s:after:w-full s:after:-translate-x-1/2",
    "s:after:bg-foreground s:after:opacity-0 s:data-[state=active]:after:opacity-100",
    "s:dark:after:bg-foreground-night",
  ],
  {
    variants: {
      variant: {
        ghost:
          "s:data-[state=inactive]:text-muted-foreground s:data-[state=inactive]:hover:text-primary-900 s:data-[state=inactive]:dark:text-muted-foreground-night s:data-[state=inactive]:dark:hover:text-primary-900-night",
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

const tabsListVariants = cva("s:flex s:h-11 s:gap-2 s:w-full", {
  variants: {
    border: {
      true: "s:border-b s:border-border s:dark:border-border-night",
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
    <ScrollBar orientation="horizontal" className="s:hidden" />
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
        className={cn("s:disabled:pointer-events-none", className)}
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
      "s:contents s:ring-offset-background s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
