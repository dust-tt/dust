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
  showArrow?: boolean;
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
      showArrow = false,
      children,
      ...props
    },
    ref
  ) => {
    const content = (
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          "s-z-50 s-max-w-sm s-overflow-hidden s-whitespace-pre-wrap s-break-words s-rounded-md s-border",
          "s-bg-background dark:s-bg-background-night",
          "s-text-foreground dark:s-text-foreground-night",
          "s-border-border dark:s-border-border-night",
          "s-px-3 s-py-1.5 s-text-sm s-shadow-md",
          "s-animate-in s-fade-in-0 s-zoom-in-95",
          "data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=closed]:s-zoom-out-95 data-[side=bottom]:s-slide-in-from-top-2 data-[side=left]:s-slide-in-from-right-2 data-[side=right]:s-slide-in-from-left-2 data-[side=top]:s-slide-in-from-bottom-2",
          className || ""
        )}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow
            width={12}
            height={7}
            className="s-fill-border dark:s-fill-border-night"
          />
        )}
      </TooltipPrimitive.Content>
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
}

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  (
    {
      trigger,
      tooltipTriggerAsChild = false,
      label,
      shortcut,
      ...props
    }: TooltipProps,
    ref
  ) => (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild={tooltipTriggerAsChild}>
          {trigger}
        </TooltipTrigger>
        <TooltipContent {...props} ref={ref}>
          <div className="s-inline-flex s-items-center s-gap-2">
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
