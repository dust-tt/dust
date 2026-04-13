import { Card, type CardVariantType } from "@sparkle/components/Card";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export type OptionCardSelectionStyle = "single" | "multi";

export interface OptionCardProps {
  label: string;
  description?: string | null;
  counterValue?: number;
  selected?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
}

export function OptionCard({
  label,
  description,
  counterValue,
  selected = false,
  disabled = false,
  className,
  onClick,
}: OptionCardProps) {
  let variant: CardVariantType = selected ? "active" : "tertiary";

  return (
    <Card
      variant={variant}
      className={cn(
        "s-flex s-w-full s-items-center s-gap-2 s-rounded-2xl s-p-3 s-text-left s-transition-colors",
        !disabled && "s-cursor-pointer",
        disabled && "s-pointer-events-none s-opacity-60",
        !selected &&
          "hover:s-bg-muted-background/60 dark:hover:s-bg-muted-background-night/60",
        className
      )}
      onClick={disabled ? undefined : onClick}
    >
      {counterValue !== undefined && (
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
