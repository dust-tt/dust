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
  /** Renders the content in a portal (defaults to true); disable to keep it in the DOM flow. */
  mountPortal?: boolean;
  /** Element to portal into, overriding the enclosing sheet container detection. */
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
  /** Element the tooltip is attached to; hovering or focusing it opens the tooltip. */
  trigger: React.ReactNode;
  /** Passes `asChild` to the Radix trigger so the trigger element itself receives the props. */
  tooltipTriggerAsChild?: boolean;
  /** Tooltip content; keep it to a few words. */
  label: React.ReactNode;
  /** Optional keyboard shortcut rendered after the label. */
  shortcut?: KeyboardShortcutProps["shortcut"];
  // Delay (ms) before the tooltip opens on hover. Radix defaults to 700ms,
  // which feels sluggish; 300ms is responsive without triggering accidentally.
  delayDuration?: number;
}

/**
 * Displays a brief, contextual label when the user hovers or focuses a trigger — ideal
 * for clarifying icon-only controls or surfacing a keyboard shortcut. Use this simple
 * form (a `trigger` plus a `label`, with an optional `shortcut`) for most cases; compose
 * `TooltipProvider` / `TooltipRoot` / `TooltipTrigger` / `TooltipContent` for full
 * control over placement and timing. Never place essential information or interactive
 * elements only inside a tooltip — it is not reachable on touch and disappears on blur.
 *
 * @summary Hover/focus label for a trigger.
 */
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
    <TooltipProvider delayDuration={delayDuration} skipDelayDuration={0}>
      <TooltipRoot disableHoverableContent>
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
