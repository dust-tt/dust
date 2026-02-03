import { cva } from "class-variance-authority";
import React, { useLayoutEffect, useRef, useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";

import { cn } from "../lib/utils";
import { ContentBlockWrapper } from "./markdown/ContentBlockWrapper";

const diffBlockContainerVariants = cva(
  [
    "s-rounded-2xl s-border",
    "s-border-border dark:s-border-border-night",
    "s-bg-muted-background dark:s-bg-muted-background-night",
    "s-text-foreground dark:s-text-foreground-night",
  ],
  {
    variants: {
      size: {
        sm: "s-p-2",
        md: "s-p-3",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const diffLineVariants = cva("s-rounded s-px-1", {
  variants: {
    type: {
      add: "s-bg-highlight-100 dark:s-bg-highlight-100-night s-text-highlight-800 dark:s-text-highlight-800-night",
      remove:
        "s-bg-warning-100 dark:s-bg-warning-100-night s-text-warning-800 dark:s-text-warning-800-night s-line-through",
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
  collapsible?: boolean;
  autoCollapsible?: boolean;
  collapseHeightPx?: number;
  collapsibleLabel?: string;
  collapsibleOpenLabel?: string;
  defaultOpen?: boolean;
};

export function DiffBlock({
  changes,
  actions,
  className,
  collapsible = false,
  autoCollapsible = false,
  collapseHeightPx = 150,
  collapsibleLabel = "Show diff",
  collapsibleOpenLabel = "Hide diff",
  defaultOpen = false,
}: DiffBlockProps) {
  const [shouldCollapse, setShouldCollapse] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (autoCollapsible && contentRef.current) {
      setShouldCollapse(contentRef.current.scrollHeight > collapseHeightPx);
    }
  }, [autoCollapsible, collapseHeightPx, changes]);

  const isCollapsible = collapsible || shouldCollapse;

  const diffContent = (
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
  );

  if (!isCollapsible) {
    return (
      <ContentBlockWrapper
        className={cn("s-w-full", className)}
        buttonDisplay="inside"
        actions={actions}
      >
        <div className={diffBlockContainerVariants({ size: "sm" })}>
          {diffContent}
        </div>
      </ContentBlockWrapper>
    );
  }

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className={cn("s-w-full", className)}
    >
      <div className={diffBlockContainerVariants({ size: "md" })}>
        <div className="s-flex s-items-center s-gap-2">
          <div className="s-flex-1">
            <CollapsibleTrigger variant="secondary">
              <span className="group-data-[state=closed]/col:s-inline group-data-[state=open]/col:s-hidden">
                {collapsibleLabel}
              </span>
              <span className="group-data-[state=closed]/col:s-hidden group-data-[state=open]/col:s-inline">
                {collapsibleOpenLabel}
              </span>
            </CollapsibleTrigger>
          </div>
          {actions}
        </div>
        <CollapsibleContent className="s-mt-3">
          {diffContent}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
