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
  footer?: React.ReactNode;
  className?: string;
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
  footer,
  className,
}: TruncatedContentProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [exceedsThreshold, setExceedsThreshold] = useState(false);
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
      <div className="s-flex s-flex-row s-items-center s-gap-2">
        {shouldShowToggle && (
          <Button
            variant="outline"
            size="xs"
            label={isCollapsed ? expandLabel : collapseLabel}
            icon={isCollapsed ? ChevronDownIcon : ChevronUpIcon}
            onClick={handleToggle}
            className="!s-text-muted-foreground dark:!s-text-primary-night"
          />
        )}
        {footer}
      </div>
    </div>
  );
}

TruncatedContent.displayName = "TruncatedContent";
