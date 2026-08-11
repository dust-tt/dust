import { DropdownMenuTrigger } from "@dust-tt/sparkle";
import type React from "react";

interface DropdownAnchorTriggerProps {
  anchorRef?: React.RefObject<HTMLElement | null>;
}

export function DropdownAnchorTrigger({
  anchorRef,
}: DropdownAnchorTriggerProps) {
  return (
    <DropdownMenuTrigger asChild>
      <div
        ref={(el) => {
          if (el && anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            el.style.position = "fixed";
            el.style.top = `${rect.top}px`;
            el.style.left = `${rect.left}px`;
            el.style.width = `${rect.width}px`;
            el.style.height = `${rect.height}px`;
            el.style.pointerEvents = "none";
            el.style.opacity = "0";
          }
        }}
      />
    </DropdownMenuTrigger>
  );
}
