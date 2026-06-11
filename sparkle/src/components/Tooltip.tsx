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
          "s:z-50 s:max-w-sm s:overflow-hidden s:whitespace-pre-wrap s:break-words s:rounded-md s:border",
          "s:bg-background s:dark:bg-background-night",
          "s:text-foreground s:dark:text-foreground-night",
          "s:border-border s:dark:border-border-night",
          "s:px-3 s:py-1.5 s:text-sm s:shadow-md",
          "s:animate-in s:fade-in-0 s:zoom-in-95",
          "s:data-[state=closed]:animate-out s:data-[state=closed]:fade-out-0 s:data-[state=closed]:zoom-out-95 s:data-[side=bottom]:slide-in-from-top-2 s:data-[side=left]:slide-in-from-right-2 s:data-[side=right]:slide-in-from-left-2 s:data-[side=top]:slide-in-from-bottom-2",
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
      <TooltipRoot disableHoverableContent>
        <TooltipTrigger asChild={tooltipTriggerAsChild}>
          {trigger}
        </TooltipTrigger>
        <TooltipContent {...props} ref={ref}>
          <div className="s:inline-flex s:items-center s:gap-2">
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
