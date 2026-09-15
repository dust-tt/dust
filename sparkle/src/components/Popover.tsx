import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useSheetContainer } from "@sparkle/hooks/useSheetContainer";
import { cn } from "@sparkle/lib/utils";
import * as React from "react";
import { useEffect, useState } from "react";

const PopoverRoot = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverPortal = PopoverPrimitive.Portal;
const PopoverAnchor = PopoverPrimitive.Anchor;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /** Let the content grow with its container instead of the default fixed width and padding. */
  fullWidth?: boolean;
  /** Render the content through a portal (default true); disable to keep it in place in the DOM. */
  mountPortal?: boolean;
  /** Element the portal mounts into; defaults to the enclosing sheet container when present. */
  mountPortalContainer?: HTMLElement;
  /** Skip returning focus to the trigger when the popover closes (default true). */
  preventAutoFocusOnClose?: boolean;
}

/**
 * The floating panel of a popover, styled and animated, rendered through a
 * portal by default. Use it with PopoverRoot / PopoverTrigger when you need
 * full control over the popover's structure.
 * @summary Floating panel of a popover.
 */
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
      mountPortalContainer,
      fullWidth = false,
      preventAutoFocusOnClose = true,
      onCloseAutoFocus,
      ...props
    },
    ref
  ) => {
    const handleCloseAutoFocus = React.useCallback(
      (event: Event) => {
        if (preventAutoFocusOnClose) {
          event.preventDefault();
        }
        onCloseAutoFocus?.(event);
      },
      [preventAutoFocusOnClose, onCloseAutoFocus]
    );
    const content = (
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          "data-[side=bottom]:slide-in-from-top-2",
          "data-[side=left]:slide-in-from-right-2",
          "data-[side=right]:slide-in-from-left-2",
          "data-[side=top]:slide-in-from-bottom-2",
          "z-50 rounded-xl border shadow-md outline-hidden",
          "border border-border",
          "bg-overlay-background",
          "text-primary-950",
          fullWidth ? "grow" : "w-72 p-4",
          className
        )}
        onCloseAutoFocus={handleCloseAutoFocus}
        {...props}
      />
    );

    const container = useSheetContainer(mountPortalContainer);

    return mountPortal ? (
      <PopoverPrimitive.Portal container={container}>
        {content}
      </PopoverPrimitive.Portal>
    ) : (
      content
    );
  }
);

interface PopoverProps extends Omit<PopoverContentProps, "content"> {
  /** Element that opens the popover. */
  trigger: React.ReactNode;
  /** Render the trigger via Radix `asChild` so the trigger element itself receives the props. */
  popoverTriggerAsChild?: boolean;
  /** Content displayed inside the popover panel. */
  content: React.ReactNode;
}

/**
 * Floating content revealed from a trigger, built on Radix Popover. This
 * all-in-one API takes `trigger` and `content`; drop to PopoverRoot /
 * PopoverTrigger / PopoverContent for full control over the structure. To
 * anchor to an element other than the trigger use AnchoredPopover; for a menu
 * of actions use Dropdown.
 * @summary Trigger-anchored floating content.
 */
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

interface AnchoredPopoverProps extends PopoverContentProps {
  /** Whether the popover is shown; the caller owns this state. */
  open: boolean;
  /** Element to anchor to; the popover tracks its position on scroll and resize. Centers in the viewport when omitted. */
  anchorRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}

/**
 * A popover positioned against an arbitrary anchor element instead of a
 * trigger, tracking the anchor through scrolling and resizing. Use it when
 * the popover must open next to an element that is not its trigger; for the
 * common trigger-anchored case, use Popover.
 * @summary Popover anchored to an arbitrary element.
 */
function AnchoredPopover({
  open,
  anchorRef,
  children,
  className,
  ...props
}: AnchoredPopoverProps) {
  const [position, setPosition] = useState({
    top: "50%",
    left: "50%",
    width: "0px",
    height: "0px",
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) {
        setPosition({
          top: "50%",
          left: "50%",
          width: "0px",
          height: "0px",
        });
        return;
      }

      const rect = anchorRef.current.getBoundingClientRect();
      setPosition({
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    };

    updatePosition();

    const resizeObserver = new ResizeObserver(updatePosition);
    if (anchorRef?.current) {
      resizeObserver.observe(anchorRef.current);
    }

    window.addEventListener("scroll", updatePosition, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef]);

  return (
    <PopoverRoot open={open} modal={false}>
      <PopoverAnchor
        // No transition here: this element is never visible, it only feeds
        // its rect to Radix's positioning math. Animating it meant that
        // math could sample an in-transit rect right after opening (the
        // anchor starts at the 50%/50%/0×0 default and tweens toward the
        // real target), landing the popover in the wrong place until the
        // animation settled — and nothing re-triggers that positioning in
        // the meantime, since it's keyed off size, not position.
        className="fixed"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          height: position.height,
        }}
      />
      <PopoverContent
        {...props}
        onOpenAutoFocus={(e) => e.preventDefault()}
        mountPortal={false}
        className={cn(className, !anchorRef && "translate-y-[-50%]")}
      >
        {children}
      </PopoverContent>
    </PopoverRoot>
  );
}

export {
  AnchoredPopover,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
};
