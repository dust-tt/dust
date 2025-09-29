import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import * as React from "react";
import { useEffect, useState } from "react";

import { classNames } from "@sparkle/lib/utils";

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
        className={classNames(
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
      />
    );

    const [container, setContainer] = useState<Element | undefined>(
      mountPortalContainer
    );

    useEffect(() => {
      if (mountPortal && !container) {
        const dialogElements = document.querySelectorAll(
          ".s-sheet[role=dialog][data-state=open]"
        );
        const defaultContainer = dialogElements[dialogElements.length - 1];
        setContainer(defaultContainer);
      }
    }, [mountPortal, container]);

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
}

const Tooltip = React.forwardRef<HTMLDivElement, TooltipProps>(
  (
    { trigger, tooltipTriggerAsChild = false, label, ...props }: TooltipProps,
    ref
  ) => (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild={tooltipTriggerAsChild}>
          {trigger}
        </TooltipTrigger>
        <TooltipContent {...props} ref={ref}>
          {label}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
);

TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
};
