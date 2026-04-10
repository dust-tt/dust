import { Card } from "@sparkle/components/Card";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export type QuestionOptionSelectionStyle = "single" | "multi";

export interface QuestionOptionProps {
  label: string;
  description?: string | null;
  counterValue?: number;
  selected?: boolean;
  selectionStyle?: QuestionOptionSelectionStyle;
  className?: string;
  onClick?: () => void;
}

export function QuestionOption({
  label,
  description,
  counterValue,
  selected = false,
  selectionStyle = "single",
  className,
  onClick,
}: QuestionOptionProps) {
  return (
    <Card
      variant="tertiary"
      className={cn(
        "s-flex s-w-full s-cursor-pointer s-items-center s-gap-2 s-rounded-2xl s-p-3 s-text-left s-transition-colors",
        selected
          ? selectionStyle === "multi"
            ? [
                "s-border-border dark:s-border-border-night",
                "s-bg-muted-background dark:s-bg-muted-background-night",
              ]
            : "s-bg-muted-background dark:s-bg-muted-background-night"
          : [
              "s-bg-background hover:s-bg-muted-background/60",
              "dark:s-bg-background-night",
              "dark:hover:s-bg-muted-background-night/60",
            ],
        className
      )}
      onClick={onClick}
    >
      {counterValue && (
        <Counter
          value={counterValue}
          size="sm"
          variant="ghost"
          className={cn(
            "s-shrink-0 s-bg-border-dark s-text-muted-foreground",
            "dark:s-bg-border-dark-night dark:s-text-muted-foreground-night"
          )}
        />
      )}
      <div className="s-flex s-flex-col">
        <span className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
          {label}
        </span>
        {description && (
          <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
            {description}
          </span>
        )}
      </div>
    </Card>
  );
}
