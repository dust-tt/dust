import React from "react";

import { ArrowRightIcon } from "@sparkle/icons";

import { cn } from "../lib/utils";
import { Button } from "./Button";
import { ContentBlockWrapper } from "./markdown/ContentBlockWrapper";

const diffAddClasses =
  "s-rounded s-bg-highlight-100 dark:s-bg-highlight-100-night s-px-1 s-text-highlight-800 dark:s-text-highlight-800-night";
const diffRemoveClasses =
  "s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-px-1 s-text-warning-800 dark:s-text-warning-800-night s-line-through";

type DiffBlockProps = {
  content: string;
  onApply?: () => void;
  className?: string;
};

export function DiffBlock({
  content,
  onApply,
  className,
}: DiffBlockProps): JSX.Element {
  const lines = content.split("\n");

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
          onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
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
            const isAddition = trimmed.startsWith("+");
            const isRemoval = trimmed.startsWith("-");
            const lineClasses = isAddition
              ? diffAddClasses
              : isRemoval
                ? diffRemoveClasses
                : "s-text-foreground dark:s-text-foreground-night";

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
