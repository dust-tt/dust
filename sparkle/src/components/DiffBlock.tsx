import { cva } from "class-variance-authority";
import React, { useLayoutEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./Button";
import { ContentBlockWrapper } from "./markdown/ContentBlockWrapper";

const diffLineVariants = cva("s-rounded s-px-1", {
  variants: {
    type: {
      add: "s-bg-highlight-50 dark:s-bg-highlight-50-night s-text-highlight-900 dark:s-text-highlight-900-night",
      remove:
        "s-bg-primary-100 dark:s-bg-primary-100-night s-text-muted-foreground dark:s-text-muted-foreground-night s-line-through",
    },
  },
});

export type DiffChange = {
  old?: string;
  new?: string;
};

type DiffBlockProps = {
  changes: DiffChange[];
  actions?: React.ReactNode;
  className?: string;
  collapsedLines?: number;
};

const DEFAULT_COLLAPSED_LINES = 6;

export function DiffBlock({
  changes,
  actions,
  className,
  collapsedLines = DEFAULT_COLLAPSED_LINES,
}: DiffBlockProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number>();
  const [expandedHeight, setExpandedHeight] = useState<number>();

  useLayoutEffect(() => {
    const element = contentRef.current;
    const container = containerRef.current;
    if (!element || !container) {
      return;
    }

    const measureHeights = () => {
      const contentStyles = window.getComputedStyle(element);
      const containerStyles = window.getComputedStyle(container);
      const paddingY =
        Number.parseFloat(containerStyles.paddingTop) +
        Number.parseFloat(containerStyles.paddingBottom);

      let lineHeight = Number.parseFloat(contentStyles.lineHeight);
      if (Number.isNaN(lineHeight)) {
        const fontSize = Number.parseFloat(contentStyles.fontSize) || 14;
        lineHeight = fontSize * 1.5;
      }

      const nextCollapsedHeight = lineHeight * collapsedLines + paddingY;
      setCollapsedHeight(nextCollapsedHeight);

      const fullHeight = element.scrollHeight + paddingY;
      setExpandedHeight(fullHeight);

      const isOverflowing = fullHeight > nextCollapsedHeight + 1;
      setIsCollapsible(isOverflowing);
      if (!isOverflowing) {
        setIsExpanded(false);
      }
    };

    measureHeights();

    const resizeObserver = new ResizeObserver(() => {
      measureHeights();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [changes, collapsedLines]);

  const shouldClamp = isCollapsible && !isExpanded;

  return (
    <ContentBlockWrapper
      className={cn("s-w-full", className)}
      buttonDisplay="inside"
      actions={actions}
    >
      <div className="s-flex s-flex-col s-gap-2">
        <div
          ref={containerRef}
          className={cn(
            "s-rounded-2xl s-border s-border-border dark:s-border-border-night",
            "s-bg-muted-background s-p-2 dark:s-bg-muted-background-night"
          )}
          style={
            isCollapsible && collapsedHeight !== undefined
              ? {
                  maxHeight: shouldClamp
                    ? collapsedHeight
                    : (expandedHeight ?? collapsedHeight),
                  overflow: "hidden",
                  transition: "max-height 200ms ease",
                }
              : undefined
          }
        >
          <div ref={contentRef} className="s-space-y-4 s-font-mono s-text-sm">
            {changes.map((change, index) => (
              <div key={index} className="s-space-y-0.5">
                {change.old && (
                  <div className="s-whitespace-pre-wrap">
                    <span className={diffLineVariants({ type: "remove" })}>
                      {change.old}
                    </span>
                  </div>
                )}
                {change.new && (
                  <div className="s-whitespace-pre-wrap">
                    <span className={diffLineVariants({ type: "add" })}>
                      {change.new}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        {isCollapsible && (
          <div className="s-flex s-justify-center">
            <Button
              size="xs"
              variant="outline"
              label={isExpanded ? "Show less" : "Show more"}
              onClick={() => setIsExpanded((value) => !value)}
              aria-expanded={isExpanded}
            />
          </div>
        )}
      </div>
    </ContentBlockWrapper>
  );
}
