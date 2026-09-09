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

/**
 * A pill-styled tab navigation root (controlled via `value`/`defaultValue`),
 * composed with NavTabPillList, NavTabPillTrigger, and NavTabPillContent.
 * Use it for primary navigation between top-level sections in compact,
 * sidebar-style layouts; for standard underlined tabs within a content area,
 * use Tabs instead.
 * @summary Pill-styled tab navigation root.
 */
const NavTabPill = TabsPrimitive.Root;

const NavTabPillList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn("flex items-center gap-1.5", className)}
    {...props}
  />
));
NavTabPillList.displayName = TabsPrimitive.List.displayName;

interface NavTabPillTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    Omit<LinkWrapperProps, "children" | "className"> {
  /** Icon shown in the pill; the label (children) expands only on the active pill and becomes a tooltip on inactive ones. */
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
    const [tooltipOpen, setTooltipOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLElement | null>(null);

    const setRefs = React.useCallback(
      (node: HTMLElement | null) => {
        triggerRef.current = node;
        if (typeof ref === "function") {
          ref(node as React.ElementRef<typeof TabsPrimitive.Trigger>);
        } else if (ref) {
          (
            ref as React.MutableRefObject<React.ElementRef<
              typeof TabsPrimitive.Trigger
            > | null>
          ).current = node as React.ElementRef<typeof TabsPrimitive.Trigger>;
        }
      },
      [ref]
    );

    const handleTooltipOpenChange = (open: boolean) => {
      // Label is already visible on the expanded (active) pill — skip the tooltip.
      if (open && triggerRef.current?.dataset.state === "active") {
        setTooltipOpen(false);
        return;
      }
      setTooltipOpen(open);
    };

    const triggerClassName = cn(
      "group flex h-8 items-center justify-center whitespace-nowrap rounded-lg pl-2 group-data-[state=active]:pl-2.5 [&:not([data-state=active])]:pr-2 text-sm",
      "text-muted-foreground",
      "hover:bg-hover",
      "font-medium",
      "bg-transparent",
      "data-[state=active]:bg-selected data-[state=active]:text-foreground",
      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      "disabled:pointer-events-none disabled:opacity-100",
      "data-[state=active]:overflow-hidden data-[state=active]:shrink",
      "transition-[padding,background-color,color] duration-200 motion-reduce:transition-none",
      "touch-hitbox",
      className
    );

    const content = (
      <>
        <Icon visual={icon} size="sm" />
        <div
          className={cn(
            "relative grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 group-data-[state=active]:grid-cols-[1fr] overflow-hidden motion-reduce:transition-none"
          )}
        >
          <span
            className="overflow-hidden min-w-0"
            style={{
              maskImage:
                "linear-gradient(to right, black calc(100% - 8px), transparent)",
            }}
          >
            <span className="group-data-[state=active]:pl-1.5 group-data-[state=active]:opacity-100 group-data-[state=inactive]:opacity-0 group-data-[state=active]:pr-2.5 whitespace-nowrap">
              {children}
            </span>
          </span>
        </div>
      </>
    );

    const trigger = href ? (
      <TabsPrimitive.Trigger ref={setRefs} asChild {...props}>
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
    ) : (
      <TabsPrimitive.Trigger
        ref={setRefs}
        className={triggerClassName}
        {...props}
      >
        {content}
      </TabsPrimitive.Trigger>
    );

    if (!children) {
      return trigger;
    }

    // TooltipTrigger sets `data-state` (open/closed). Wrap in a span so that
    // attribute doesn't overwrite the Tabs trigger's `data-state` (active/
    // inactive), which drives selected styles and the label expand animation.
    return (
      <TooltipProvider delayDuration={300} skipDelayDuration={0}>
        <TooltipRoot
          open={tooltipOpen}
          onOpenChange={handleTooltipOpenChange}
          disableHoverableContent
        >
          <TooltipTrigger asChild>
            <span className="inline-flex">{trigger}</span>
          </TooltipTrigger>
          <TooltipContent>{children}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
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
      "contents focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
));
NavTabPillContent.displayName = TabsPrimitive.Content.displayName;

export { NavTabPill, NavTabPillContent, NavTabPillList, NavTabPillTrigger };
