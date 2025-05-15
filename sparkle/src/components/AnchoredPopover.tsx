import React, { useEffect, useState } from "react";

import {
  PopoverAnchor,
  PopoverContent,
  PopoverRoot,
} from "@sparkle/components/Popover";

interface AnchoredPopoverProps {
  open: boolean;
  anchorRef?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
  className?: string;
}

export function AnchoredPopover({
  open,
  anchorRef,
  children,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  className,
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
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={className}
        onOpenAutoFocus={(e) => e.preventDefault()}
        mountPortal={false}
      >
        {children}
      </PopoverContent>
    </PopoverRoot>
  );
}
