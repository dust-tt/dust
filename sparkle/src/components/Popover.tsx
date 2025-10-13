import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as React from "react";
import { useEffect, useState } from "react";

import { cn } from "@sparkle/lib/utils";

const PopoverRoot = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverPortal = PopoverPrimitive.Portal;
const PopoverAnchor = PopoverPrimitive.Anchor;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  fullWidth?: boolean;
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  preventAutoFocusOnClose?: boolean;
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
          "data-[state=open]:s-animate-in data-[state=open]:s-fade-in-0 data-[state=open]:s-zoom-in-95",
          "data-[state=closed]:s-animate-out data-[state=closed]:s-fade-out-0 data-[state=closed]:s-zoom-out-95",
          "data-[side=bottom]:s-slide-in-from-top-2",
          "data-[side=left]:s-slide-in-from-right-2",
          "data-[side=right]:s-slide-in-from-left-2",
          "data-[side=top]:s-slide-in-from-bottom-2",
          "s-z-50 s-rounded-xl s-border s-shadow-md s-outline-none",
          "s-border s-border-border dark:s-border-border-night",
          "s-bg-background dark:s-bg-background-night",
          "s-text-primary-950 dark:s-text-primary-950-night",
          fullWidth ? "s-grow" : "s-w-72 s-p-4",
          className
        )}
        onCloseAutoFocus={handleCloseAutoFocus}
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
      <PopoverPrimitive.Portal container={container}>
        {content}
      </PopoverPrimitive.Portal>
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

interface AnchoredPopoverProps extends PopoverContentProps {
  open: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}

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
        className="s-fixed s-transition-all s-duration-300 s-ease-in-out"
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
        className={cn(className, !anchorRef && "s-translate-y-[-50%]")}
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
