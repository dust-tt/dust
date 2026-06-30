import { cva } from "class-variance-authority";
import type { ReactElement } from "react";
import React, { useLayoutEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Button } from "./Button";
import { ContentBlockWrapper } from "./markdown/ContentBlockWrapper";

const diffLineVariants = cva("rounded px-1", {
  variants: {
    type: {
      add: "bg-highlight-50 text-highlight-900",
      remove: "bg-primary-100 text-muted-foreground line-through",
    },
  },
});

export type DiffChange = {
  old?: string;
  new?: string;
};

export type DiffBlockProps = {
  actions?: ReactElement;
  className?: string;
  collapsedLines?: number;
  changes?: DiffChange[];
  children?: React.ReactNode;
};

const DEFAULT_COLLAPSED_LINES = 6;

/** Rough CSS estimate to prevent flash before measurement */
function getEstimatedCollapsedHeight(collapsedLines: number) {
  return `calc(${collapsedLines} * 1.5em + 1rem)`;
}

export function DiffBlock({
  changes,
  children,
  actions,
  className,
  collapsedLines = DEFAULT_COLLAPSED_LINES,
}: DiffBlockProps) {
  const hasContent = changes !== undefined || children !== undefined;

  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCollapsible, setIsCollapsible] = useState(false);
  const [isMeasured, setIsMeasured] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number>();
  const [expandedHeight, setExpandedHeight] = useState<number>();

  // biome-ignore lint/correctness/useExhaustiveDependencies: changes/children are props that trigger re-measurement when content changes
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
      setIsMeasured(true);
    };

    measureHeights();

    const resizeObserver = new ResizeObserver(() => {
      measureHeights();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [changes, children, collapsedLines]);

  if (!hasContent) {
    return null;
  }

  const shouldClamp = isCollapsible && !isExpanded;

  return (
    <ContentBlockWrapper
      className={cn("w-full", className)}
      buttonDisplay="inside"
      actions={actions}
    >
      <div className="flex flex-col gap-2">
        <div
          ref={containerRef}
          className={cn(
            "rounded-2xl border border-border",
            "bg-muted-background p-2"
          )}
          style={
            !isMeasured
              ? {
                  overflow: "hidden",
                  maxHeight: getEstimatedCollapsedHeight(collapsedLines),
                }
              : isCollapsible && collapsedHeight !== undefined
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
          <div
            ref={contentRef}
            className={
              children
                ? "space-y-4 font-mono text-sm [&_.ProseMirror]:min-h-0 [&_.ProseMirror]:p-0"
                : "space-y-4 font-mono text-sm"
            }
          >
            {children ??
              changes?.map((change, index) => (
                <div key={index} className="space-y-0.5">
                  {change.old && (
                    <div className="whitespace-pre-wrap">
                      <span className={diffLineVariants({ type: "remove" })}>
                        {change.old}
                      </span>
                    </div>
                  )}
                  {change.new && (
                    <div className="whitespace-pre-wrap">
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
          <div className="flex justify-start px-3">
            <Button
              size="xs"
              variant="outline"
              label={isExpanded ? "Show less" : "Show more"}
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded((value) => !value);
              }}
              aria-expanded={isExpanded}
            />
          </div>
        )}
      </div>
    </ContentBlockWrapper>
  );
}
