import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const PopoverRoot = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverPortal = PopoverPrimitive.Portal;

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  fullWidth?: boolean;
  mountPortal?: boolean;
}

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(
  (
    {
      className,
      align = "center",
      sideOffset = 4,
      mountPortal = true,
      fullWidth = false,
      ...props
    },
    ref
  ) => {
    const content = (
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "data-[state=open]:s-animate-in data-[state=open]:s-fade-in-0 data-[state=open]:s-zoom-in-95",
          "data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=closed]:s-zoom-out-95",
          "data-[side=bottom]:s-slide-in-from-top-2",
          "data-[side=left]:s-slide-in-from-right-2",
          "data-[side=right]:s-slide-in-from-left-2",
          "data-[side=top]:s-slide-in-from-bottom-2",
          "s-z-50 s-rounded-xl s-border s-shadow-md s-outline-none",
          "s-bg-background dark:s-bg-background-night",
          "s-text-primary-950 dark:s-text-primary-950-night",
          fullWidth ? "s-grow" : "s-w-72 s-p-4",
          className
        )}
        {...props}
      />
    );

    return mountPortal ? (
      <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal>
    ) : (
      content
    );
  }
);

interface PopoverProps extends Omit<PopoverContentProps, "content"> {
  trigger: React.ReactNode;
  popoverTriggerAsChild?: boolean;
  content: React.ReactNode;
}

function Popover({
  trigger,
  popoverTriggerAsChild = false,
  content,
  ...props
}: PopoverProps) {
  return (
    <PopoverRoot>
      <PopoverTrigger asChild={popoverTriggerAsChild}>{trigger}</PopoverTrigger>
      <PopoverContent {...props}>{content}</PopoverContent>
    </PopoverRoot>
  );
}

PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverContent, PopoverPortal, PopoverRoot, PopoverTrigger };
