import { cva } from "class-variance-authority";
import type { CSSProperties, ReactElement } from "react";
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

const diffContainerVariants = cva("p-2", {
  variants: {
    variant: {
      default: "rounded-2xl border border-border bg-muted-background",
      borderless: "rounded-2xl bg-muted-background",
      plain: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export type DiffChange = {
  /** Removed content (may span multiple lines). */
  old?: string;
  /** Added content (may span multiple lines). */
  new?: string;
};

export type DiffBlockProps = {
  /** Controls rendered in the block's action slot (e.g. a "view changes" Button). */
  actions?: ReactElement;
  className?: string;
  /** When false, the whole diff always shows; otherwise it collapses past 6 lines behind a "Show more" toggle (default true). */
  isCollapsible?: boolean;
  /**
   * Box around the diff: "default" has a border and background, "borderless" keeps only the
   * background, "plain" has neither so the diff blends into its container.
   */
  variant?: "default" | "borderless" | "plain";
  /** The edits to display as removal/addition line pairs; ignored when children is provided. */
  changes?: DiffChange[];
  /** Custom diff content (e.g. a read-only editor showing a suggestion) rendered instead of the changes array. */
  children?: React.ReactNode;
};

const COLLAPSED_LINES = 6;

/** Rough CSS estimate to prevent flash before measurement */
const ESTIMATED_COLLAPSED_HEIGHT = `calc(${COLLAPSED_LINES} * 1.5em + 1rem)`;

// Clamps a container to a fixed number of content lines. The real line height is only known once
// mounted, so an estimate clamps the first paint, and content resizes trigger a re-measure.
function useClampedHeight({
  hasContent,
  isEnabled,
}: {
  hasContent: boolean;
  isEnabled: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isMeasured, setIsMeasured] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number>();
  const [expandedHeight, setExpandedHeight] = useState<number>();

  useLayoutEffect(() => {
    const element = contentRef.current;
    const container = containerRef.current;
    if (!isEnabled || !element || !container) {
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

      const nextCollapsedHeight = lineHeight * COLLAPSED_LINES + paddingY;
      setCollapsedHeight(nextCollapsedHeight);

      const fullHeight = element.scrollHeight + paddingY;
      setExpandedHeight(fullHeight);

      const nextIsOverflowing = fullHeight > nextCollapsedHeight + 1;
      setIsOverflowing(nextIsOverflowing);
      if (!nextIsOverflowing) {
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
  }, [hasContent, isEnabled]);

  let containerStyle: CSSProperties | undefined;
  if (isEnabled && !isMeasured) {
    containerStyle = {
      overflow: "hidden",
      maxHeight: ESTIMATED_COLLAPSED_HEIGHT,
    };
  } else if (isEnabled && isOverflowing && collapsedHeight !== undefined) {
    containerStyle = {
      maxHeight: isExpanded
        ? (expandedHeight ?? collapsedHeight)
        : collapsedHeight,
      overflow: "hidden",
      transition: "max-height 200ms ease",
    };
  }

  return {
    containerRef,
    contentRef,
    containerStyle,
    isExpanded,
    isOverflowing: isEnabled && isOverflowing,
    toggleExpanded: () => setIsExpanded((value) => !value),
  };
}

/**
 * Renders edits as a line-by-line diff, from { old, new } pairs or custom
 * children. Large diffs collapse behind a "Show more" toggle. For plain code
 * rendering, use CodeBlock.
 * @summary Collapsible line-by-line code diff.
 */
/**
 * @cc [owner:avervaet,label:react] box-styling-through-variant
 * Callers MUST change the box around the diff only through `variant`, never through class
 * selectors targeting the component's internal elements.
 */
export function DiffBlock({
  changes,
  children,
  actions,
  className,
  isCollapsible = true,
  variant = "default",
}: DiffBlockProps) {
  const hasContent = changes !== undefined || children !== undefined;

  const {
    containerRef,
    contentRef,
    containerStyle,
    isExpanded,
    isOverflowing,
    toggleExpanded,
  } = useClampedHeight({
    hasContent,
    isEnabled: isCollapsible,
  });

  if (!hasContent) {
    return null;
  }

  return (
    <ContentBlockWrapper
      className={cn("w-full", className)}
      buttonDisplay="inside"
      actions={actions}
    >
      <div className="flex flex-col gap-2">
        <div
          ref={containerRef}
          className={diffContainerVariants({ variant })}
          style={containerStyle}
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
        {isOverflowing && (
          <div className="flex justify-start px-3">
            <Button
              size="xs"
              variant="outline"
              label={isExpanded ? "Show less" : "Show more"}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded();
              }}
              aria-expanded={isExpanded}
            />
          </div>
        )}
      </div>
    </ContentBlockWrapper>
  );
}
