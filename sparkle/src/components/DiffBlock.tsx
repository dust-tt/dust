import { cva } from "class-variance-authority";
import React from "react";

import { ArrowRightIcon } from "@sparkle/icons";

import { cn } from "../lib/utils";
import { Button } from "./Button";
import { ContentBlockWrapper } from "./markdown/ContentBlockWrapper";

const DIFF_LINE_SPLIT_REGEX = /\n/;
const DIFF_ADD_PREFIX = "+";
const DIFF_REMOVE_PREFIX = "-";

const diffLineVariants = cva("s-rounded s-px-1", {
  variants: {
    type: {
      add: "s-bg-highlight-100 dark:s-bg-highlight-100-night s-text-highlight-800 dark:s-text-highlight-800-night",
      remove:
        "s-bg-warning-100 dark:s-bg-warning-100-night s-text-warning-800 dark:s-text-warning-800-night s-line-through",
      neutral: "s-text-foreground dark:s-text-foreground-night",
    },
  },
  defaultVariants: {
    type: "neutral",
  },
});

type DiffBlockProps = {
  content: string;
  onApply?: () => void;
  className?: string;
};

export function DiffBlock({
  content,
  onApply,
  className,
}: DiffBlockProps) {
  const lines = content.split(DIFF_LINE_SPLIT_REGEX);

  return (
    <ContentBlockWrapper
      className={cn("s-w-full", className)}
      buttonDisplay="inside"
      displayActions="always"
      actions={
        <Button
          size="xs"
          variant="primary"
          label="Apply"
          icon={ArrowRightIcon}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onApply?.();
          }}
        />
      }
    >
      <div
        className={cn(
          "s-rounded-2xl s-border s-border-border dark:s-border-border-night",
          "s-bg-muted-background s-p-2 dark:s-bg-muted-background-night",
          "s-text-foreground dark:s-text-foreground-night"
        )}
      >
        <div className="s-space-y-1 s-font-mono s-text-sm">
          {lines.map((line, index) => {
            const trimmed = line.trimStart();
            const isAddition = trimmed.startsWith(DIFF_ADD_PREFIX);
            const isRemoval = trimmed.startsWith(DIFF_REMOVE_PREFIX);
            const lineClasses = diffLineVariants({
              type: isAddition ? "add" : isRemoval ? "remove" : "neutral",
            });

            return (
              <div key={`${index}-${line}`} className="s-whitespace-pre-wrap">
                <span className={lineClasses}>{line}</span>
              </div>
            );
          })}
        </div>
      </div>
    </ContentBlockWrapper>
  );
}
