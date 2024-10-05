import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";

import { classNames } from "@sparkle/lib/utils";

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={classNames(
      "s-bg-primary-50 s-text-primary-700 s-z-50 s-max-w-xs s-overflow-hidden s-rounded-md s-border s-bg-white s-px-3 s-py-1.5 s-text-sm s-shadow-md",
      "s-animate-in s-fade-in-0 s-zoom-in-95",
      "data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=closed]:s-zoom-out-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2",
      className || ""
    )}
    {...props}
  />
));

interface TooltipProps extends TooltipContentProps {
  trigger: React.ReactNode;
  label: React.ReactNode;
}

function Tooltip({ trigger, label, ...props }: TooltipProps) {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger>{trigger}</TooltipTrigger>
        <TooltipContent {...props}>{label}</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
};
