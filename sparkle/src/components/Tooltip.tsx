import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
} from "@sparkle/components/KeyboardShortcut";
import { useSheetContainer } from "@sparkle/hooks/useSheetContainer";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

const TooltipProvider = TooltipPrimitive.Provider;

const TooltipRoot = TooltipPrimitive.Root;
const TooltipPortal = TooltipPrimitive.Portal;

const TooltipTrigger = TooltipPrimitive.Trigger;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    {
      className,
      sideOffset = 4,
      mountPortal = true,
      mountPortalContainer,
      ...props
    },
    ref
  ) => {
    const content = (
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "z-50 max-w-sm overflow-hidden whitespace-pre-wrap break-words rounded-md border",
          "bg-overlay-background",
          "text-foreground",
          "border-border",
          "px-3 py-1.5 text-sm shadow-md",
          "origin-[var(--radix-tooltip-content-transform-origin)]",
          "animate-in fade-in-0 zoom-in-95 duration-200 ease-enter",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          "motion-reduce:animate-none",
          className || ""
        )}
        {...props}
      />
    );

    const container = useSheetContainer(mountPortalContainer);

    return mountPortal ? (
      <TooltipPrimitive.Portal container={container}>
        {content}
      </TooltipPrimitive.Portal>
    ) : (
      content
    );
  }
);

interface TooltipProps extends TooltipContentProps {
  trigger: React.ReactNode;
  tooltipTriggerAsChild?: boolean;
  label: React.ReactNode;
  shortcut?: KeyboardShortcutProps["shortcut"];
  // Delay (ms) before the tooltip opens on hover. Radix defaults to 700ms,
  // which feels sluggish; 300ms is responsive without triggering accidentally.
  delayDuration?: number;
}

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      trigger,
      tooltipTriggerAsChild = false,
      label,
      shortcut,
      delayDuration = 300,
      ...props
    }: TooltipProps,
    ref
  ) => (
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipRoot disableHoverableContent>
        <TooltipTrigger asChild={tooltipTriggerAsChild}>
          {trigger}
        </TooltipTrigger>
        <TooltipContent {...props} ref={ref}>
          <div className="inline-flex items-center gap-2">
            {label}
            {shortcut && <KeyboardShortcut shortcut={shortcut} />}
          </div>
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
);
Tooltip.displayName = "Tooltip";

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
};
