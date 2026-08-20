import { Button } from "@sparkle/components/Button";
import { ChevronDown, ChevronUp } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { useEffect, useRef, useState } from "react";

const contentVariants = cva("relative", {
  variants: {
    collapsed: {
      true: "overflow-hidden",
    },
  },
  defaultVariants: {
    collapsed: false,
  },
});

export interface TruncatedContentProps {
  children: React.ReactNode;
  /** Content height (px) above which the clamp and toggle kick in (defaults to 420). */
  thresholdPx?: number;
  /** Height (px) the content is clamped to while collapsed (defaults to 320). */
  collapsedHeightPx?: number;
  /** Whether the content starts collapsed (defaults to true). */
  defaultCollapsed?: boolean;
  /** Animates the height when toggling (defaults to false). */
  animated?: boolean;
  /** Duration of the height transition when `animated` (defaults to 200). */
  animationDurationMs?: number;
  /** Toggle label while collapsed (defaults to "Show more"). */
  expandLabel?: string;
  /** Toggle label while expanded (defaults to "Show less"). */
  collapseLabel?: string;
  /** Toggle styling: "default" is an outline button with a chevron; "light" is a ghost button without one. */
  variant?: "default" | "light";
  /** Extra controls rendered beside the toggle, visible regardless of expansion state. */
  footer?: React.ReactNode;
  className?: string;
  buttonClassName?: string;
}

/**
 * Clamps tall content to a collapsed height and reveals a show-more / show-less toggle
 * when it overflows, with a fade-out gradient at the clamp edge. Use it for long text or
 * rich blocks (descriptions, transcripts) that should stay compact until expanded, tuning
 * `thresholdPx` so short content renders fully without a redundant toggle. For clamping a
 * short text to a line count with a tooltip, use `TruncatedText` instead.
 *
 * @summary Collapsible overflow container with show-more toggle.
 */
export function TruncatedContent({
  children,
  thresholdPx = 420,
  collapsedHeightPx = 320,
  defaultCollapsed = true,
  animated = false,
  animationDurationMs = 200,
  expandLabel = "Show more",
  collapseLabel = "Show less",
  variant = "default",
  footer,
  className,
  buttonClassName,
}: TruncatedContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [exceedsThreshold, setExceedsThreshold] = useState(defaultCollapsed);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setExceedsThreshold(el.scrollHeight > thresholdPx);
    }
  }, [thresholdPx]);

  const shouldShowToggle = exceedsThreshold;
  const isCurrentlyCollapsed = shouldShowToggle && isCollapsed;

  const handleToggle = () => setIsCollapsed((prev) => !prev);

  return (
    <div className={className}>
      <div
        ref={contentRef}
        className={cn(contentVariants({ collapsed: isCurrentlyCollapsed }))}
        style={{
          maxHeight: isCurrentlyCollapsed
            ? `${collapsedHeightPx}px`
            : animated && shouldShowToggle
              ? `${contentRef.current?.scrollHeight}px`
              : undefined,
          transition:
            animated && shouldShowToggle
              ? `max-height ${animationDurationMs}ms ease-out`
              : undefined,
        }}
      >
        {children}
        {isCurrentlyCollapsed && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-24 bg-linear-to-t from-background" />
        )}
      </div>
      {(shouldShowToggle || footer) && (
        <div className={cn("flex items-center", shouldShowToggle && "gap-3")}>
          {shouldShowToggle && (
            <Button
              variant={variant === "light" ? "ghost-secondary" : "outline"}
              size="xs"
              label={isCollapsed ? expandLabel : collapseLabel}
              icon={
                variant === "light"
                  ? undefined
                  : isCollapsed
                    ? ChevronDown
                    : ChevronUp
              }
              onClick={handleToggle}
              className={buttonClassName}
            />
          )}
          {footer}
        </div>
      )}
    </div>
  );
}

TruncatedContent.displayName = "TruncatedContent";
