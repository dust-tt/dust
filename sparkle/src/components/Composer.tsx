import { cn } from "@sparkle/lib/utils";
import React from "react";

import { CitationGrid } from "./Citation";

export const COMPOSER_VARIANTS = ["floating", "flat"] as const;
export type ComposerVariantType = (typeof COMPOSER_VARIANTS)[number];

interface ComposerProps {
  children?: React.ReactNode;
  attachments?: React.ReactNode;
  chips?: React.ReactNode;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  variant?: ComposerVariantType;
  isFocused?: boolean;
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
  const cardClassName = cn(
    "rounded-squircle-40 relative flex w-full flex-col items-stretch overflow-hidden",
    variant === "floating" && [
      "border border-white/90",
      "transition-[background-color,box-shadow] duration-150 ease-emphasized motion-reduce:transition-none",
      isFocused
        ? "shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.07),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]"
        : "shadow-[0px_-1px_1px_-0.5px_rgba(0,0,0,0.05),0px_0px_0px_1.5px_rgba(0,0,0,0.04),0px_1px_1px_-0.5px_rgba(0,0,0,0.07),0px_6px_6px_-3px_rgba(0,0,0,0.06)]",
      isFocused ? "bg-stone-25" : "bg-[oklch(0.988_0_89.876)]",
      "dark:border-transparent",
      isFocused
        ? "dark:bg-[oklch(0.310_0.007_75)]"
        : "dark:bg-[oklch(0.294_0.008_84.593)]",
      isFocused
        ? "dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.035),inset_0px_0px_0px_1px_rgba(255,255,255,0.055),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]"
        : "dark:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.02),inset_0px_0px_0px_1px_rgba(255,255,255,0.04),0px_0px_0px_1.5px_rgba(0,0,0,0.14),0px_1px_1px_-0.5px_rgba(0,0,0,0.18),0px_3px_3px_-1.5px_rgba(0,0,0,0.18),0px_6px_6px_-3px_rgba(0,0,0,0.18)]",
    ],
    variant === "flat" && [
      "border",
      "transition-colors duration-100 ease-emphasized motion-reduce:transition-none",
      isFocused ? "bg-stone-25" : "bg-[oklch(0.988_0_89.876)]",
      isFocused
        ? "dark:bg-[oklch(0.310_0.007_75)]"
        : "dark:bg-[oklch(0.294_0.008_84.593)]",
      isFocused ? "border-border-dark dark:border-stone-750" : "border-border",
    ],
    className
  );

  return (
    <div className={cardClassName}>
      {variant === "floating" && (
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-[inherit] [corner-shape:inherit] shadow-[inset_0px_-3px_29px_2px_rgba(0,0,0,0.01)] dark:hidden"
        />
      )}

      {attachments != null && (
        <CitationGrid className="border-b border-separator px-3 pb-3 pt-3">
          {attachments}
        </CitationGrid>
      )}

      {/* Pointer-only click-to-focus affordance: no button semantics, so the
          input inside stays the only interactive/focusable element. */}
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
          <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
            {chips}
          </div>
        )}
      </div>

      {(leftActions != null || rightActions != null) && (
        <div className="flex items-center justify-between px-3 pb-3 pt-2">
          <div className="flex items-center gap-1.5">{leftActions}</div>
          <div className="flex items-center gap-2.5">{rightActions}</div>
        </div>
      )}
    </div>
  );
}
