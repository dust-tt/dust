import { Button } from "@sparkle/components/Button";
import { ChevronDownIcon, ChevronUpIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { useEffect, useRef, useState } from "react";

const contentVariants = cva("s-relative", {
  variants: {
    collapsed: {
      true: "s-overflow-hidden",
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
          <div className="s-pointer-events-none s-absolute s-bottom-0 s-left-0 s-right-0 s-h-24 s-bg-gradient-to-t s-from-background dark:s-from-background-night" />
        )}
      </div>
      {(shouldShowToggle || footer) && (
        <div
          className={cn(
            "s-flex s-items-center",
            shouldShowToggle && "s-gap-3"
          )}
        >
          {shouldShowToggle && (
            <Button
              variant={variant === "light" ? "ghost-secondary" : "outline"}
              size="xs"
              label={isCollapsed ? expandLabel : collapseLabel}
              icon={
                variant === "light"
                  ? undefined
                  : isCollapsed
                    ? ChevronDownIcon
                    : ChevronUpIcon
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
