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
  thresholdPx?: number;
  collapsedHeightPx?: number;
  defaultCollapsed?: boolean;
  animated?: boolean;
  animationDurationMs?: number;
  expandLabel?: string;
  collapseLabel?: string;
  variant?: "default" | "light";
  footer?: React.ReactNode;
  className?: string;
  buttonClassName?: string;
}

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
