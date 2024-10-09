import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const PopoverRoot = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  fullWidth?: boolean;
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
      fullWidth = false,
      ...props
    },
    ref
  ) => (
    <PopoverPrimitive.Portal>
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
          "s-border-border s-text-primary-950 s-z-50 s-rounded-lg s-border s-bg-background s-shadow-md s-outline-none",
          fullWidth ? "s-grow" : "s-w-72 s-p-4",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
);

interface PopoverProps extends Omit<PopoverContentProps, "content"> {
  trigger: React.ReactNode;
  content: React.ReactNode;
}

function Popover({ trigger, content, ...props }: PopoverProps) {
  return (
    <PopoverRoot>
      <PopoverTrigger>{trigger}</PopoverTrigger>
      <PopoverContent {...props}>{content}</PopoverContent>
    </PopoverRoot>
  );
}

PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverContent, PopoverRoot, PopoverTrigger };
