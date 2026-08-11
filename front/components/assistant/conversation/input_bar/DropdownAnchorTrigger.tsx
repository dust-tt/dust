import { DropdownMenuTrigger } from "@dust-tt/sparkle";
import type React from "react";

interface DropdownAnchorTriggerProps {
  anchorRef?: React.RefObject<HTMLElement | null>;
}

/**
 * Invisible trigger that mirrors another element's box so an externally
 * controlled dropdown can position itself against a button it does not own —
 * e.g. the input bar's "+" button opening the capabilities picker as a
 * top-level dropdown on mobile, where nested sub-menus do not fit the viewport.
 */
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
