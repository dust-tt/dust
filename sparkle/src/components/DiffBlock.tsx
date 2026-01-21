import React from "react";

import { ArrowRightIcon } from "@sparkle/icons";

import { cn } from "../lib/utils";
import { Button } from "./Button";

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
    <div
      className={cn(
        "s-w-full s-rounded-md s-border s-border-border dark:s-border-border-night",
        "s-bg-muted/70 dark:s-bg-muted-night/70",
        className
      )}
    >
      <div className="s-flex s-items-center s-justify-end s-gap-2 s-border-b s-border-border s-px-2 s-py-1 dark:s-border-border-night">
        <Button
          size="xs"
          variant="primary"
          label="Apply"
          onClick={onApply ?? (() => {})}
          icon={ArrowRightIcon}
        />
      </div>
      <div className="s-space-y-1 s-p-2 s-font-mono s-text-sm s-text-foreground dark:s-text-foreground-night">
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
  );
}
