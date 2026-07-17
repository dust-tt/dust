import { cn } from "@sparkle/lib/utils";
import React from "react";

import { CitationGrid } from "./Citation";

export const COMPOSER_VARIANTS = ["floating", "flat"] as const;
export type ComposerVariantType = (typeof COMPOSER_VARIANTS)[number];

interface ComposerProps {
  children?: React.ReactNode;
  /** Attachment chips rendered above the input, separated by a border. */
  attachments?: React.ReactNode;
  /** Removable chips (e.g. selected tools) rendered between the input and the actions row. */
  chips?: React.ReactNode;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  variant?: ComposerVariantType;
  isFocused?: boolean;
  /** Clicking anywhere on the content area (outside actions) — used to focus the input. */
  onContentClick?: () => void;
  className?: string;
}

export function Composer({
  children,
  attachments,
  chips,
  leftActions,
  rightActions,
  variant = "floating",
  isFocused = false,
  onContentClick,
  className,
}: ComposerProps) {
  return (
    <div
      className={cn(
        // Figma corner smoothing (radius 24, smoothing 100%): CSS squircle flattens the curve
        // relative to Figma's smoothing at the same radius, so the radius is bumped to compensate.
        "relative flex w-full flex-col items-stretch rounded-[40px] [corner-shape:squircle]",
        variant === "floating" && [
          "border border-white/90",
          // Crossfade the focus state instead of snapping (background-color + box-shadow only).
          "transition-[background-color,box-shadow] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
          // Same tight shadow "strength" as dark mode (ring + 3 close drop shadows) instead of the
          // Figma light spec's large soft blur, which reads as flat/washed-out. Alphas lightened
          // relative to dark's (ring 0.14 -> 0.05, drops 0.18 -> 0.1): light already has a real
          // border-white/90 for the edge (the ring is just a faint assist), and black shadows read
          // darker on a light page than the same alpha does on a dark one. Constant across focus
          // states too — only the background color changes on focus.
          "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.05),0px_1px_1px_-0.5px_rgba(0,0,0,0.1),0px_3px_3px_-1.5px_rgba(0,0,0,0.1),0px_6px_6px_-3px_rgba(0,0,0,0.1)]",
          isFocused ? "bg-white" : "bg-[#fbfbfb]",
          // Dark (Figma 12333:27502): Surface/4 background + Surfaces/Dark/4 effect set.
          "dark:border-transparent dark:bg-[#2e2c28]",
          "dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]",
        ],
        variant === "flat" && [
          "border bg-background",
          isFocused ? "border-border-dark" : "border-border",
        ],
        className
      )}
    >
      {/* Bottom-edge inner vignette (floating light mode only). */}
      {variant === "floating" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[-1px] rounded-[inherit] shadow-[inset_0px_-3px_29px_2px_rgba(0,0,0,0.01)] dark:hidden"
        />
      )}

      {attachments != null && (
        <CitationGrid className="border-b border-separator px-3 pb-3 pt-3">
          {attachments}
        </CitationGrid>
      )}

      <div
        className={cn(
          "flex flex-1 flex-col items-stretch",
          onContentClick && "cursor-text"
        )}
        onClick={onContentClick}
      >
        <div className="flex flex-col items-start pl-4 pr-4 pt-4">
          {children}
        </div>

        {chips != null && (
          <div className="flex flex-wrap items-center gap-1 px-2 pt-2">
            {chips}
          </div>
        )}
      </div>

      {/* px-2: with ghost buttons' own px-2 padding, labels/icons line up with the input text (pl-4). */}
      {(leftActions != null || rightActions != null) && (
        <div className="flex items-center justify-between px-2 pb-3 pt-2">
          <div className="flex items-center gap-1">{leftActions}</div>
          <div className="flex items-center gap-1.5">{rightActions}</div>
        </div>
      )}
    </div>
  );
}
