import { cva } from "class-variance-authority";
import React from "react";

import { cn } from "../lib/utils";
import { ContentBlockWrapper } from "./markdown/ContentBlockWrapper";

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
};

export function DiffBlock({ changes, actions, className }: DiffBlockProps) {
  return (
    <ContentBlockWrapper
      className={cn("s-w-full", className)}
      buttonDisplay="inside"
      actions={actions}
    >
      <div
        className={cn(
          "s-rounded-2xl s-border s-border-border dark:s-border-border-night",
          "s-bg-muted-background s-p-2 dark:s-bg-muted-background-night",
          "s-text-foreground dark:s-text-foreground-night"
        )}
      >
        <div className="s-space-y-4 s-font-mono s-text-sm">
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
    </ContentBlockWrapper>
  );
}
