import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  KeyboardShortcut,
  type KeyboardShortcutProps,
} from "@sparkle/components/KeyboardShortcut";
import { useSheetContainer } from "@sparkle/hooks/useSheetContainer";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";

// Tracks whether a sparkle TooltipProvider is mounted above. Tooltips under a
// shared provider skip their per-instance provider, so Radix's
// skipDelayDuration can work across sibling tooltips (first hover waits,
// moving to an adjacent trigger opens instantly).
const TooltipProviderContext = React.createContext(false);

type TooltipProviderProps = React.ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Provider
>;

function TooltipProvider({
  delayDuration = 300,
  skipDelayDuration = 300,
  children,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    >
      <TooltipProviderContext.Provider value={true}>
        {children}
      </TooltipProviderContext.Provider>
    </TooltipPrimitive.Provider>
  );
}

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
          "z-50 max-w-sm overflow-hidden whitespace-pre-wrap break-words rounded-lg",
          "bg-primary text-primary-50 text-xs",
          "px-3 py-1.5",
          "shadow-[inset_0px_1px_4px_0px_rgba(255,255,255,0.1)] dark:shadow-none",
          "origin-[var(--radix-tooltip-content-transform-origin)]",
          "animate-in fade-in-0 zoom-in-95 duration-150 ease-emphasized",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100",
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
  ) => {
    const hasProvider = React.useContext(TooltipProviderContext);
    const tooltip = (
      <TooltipRoot disableHoverableContent delayDuration={delayDuration}>
        <TooltipTrigger asChild={tooltipTriggerAsChild}>
          {trigger}
        </TooltipTrigger>
        <TooltipContent {...props} ref={ref}>
          <div className="inline-flex items-center gap-2">
            {label}
            {shortcut && (
              <KeyboardShortcut
                shortcut={shortcut}
                className="text-xs text-primary-200"
              />
            )}
          </div>
        </TooltipContent>
      </TooltipRoot>
    );

    // Under a shared provider the per-instance provider is skipped so
    // skip-delay spans sibling tooltips; standalone tooltips still get
    // skip-delay on their own trigger via the wrapper defaults.
    return hasProvider ? (
      tooltip
    ) : (
      <TooltipProvider delayDuration={delayDuration}>{tooltip}</TooltipProvider>
    );
  }
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
