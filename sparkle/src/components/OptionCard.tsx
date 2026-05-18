import { Card, type CardVariantType } from "@sparkle/components/Card";
import { Counter } from "@sparkle/components/Counter";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface OptionCardProps {
  label: string;
  description?: string | null;
  counterValue?: number;
  selected?: boolean;
  disabled?: boolean;
  disableHover?: boolean;
  className?: string;
  onClick?: () => void;
  onFocusCapture?: React.FocusEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
}

export function OptionCard({
  label,
  description,
  counterValue,
  selected = false,
  disabled = false,
  disableHover = false,
  className,
  onClick,
  onFocusCapture,
  onMouseEnter,
}: OptionCardProps) {
  const variant: CardVariantType = selected ? "active" : "tertiary";
  const isInteractive = onClick !== undefined && !disabled;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      variant={variant}
      className={cn(
        "s-w-full s-items-center s-gap-2 s-rounded-2xl s-text-left s-transition-colors",
        !disabled && "s-cursor-pointer",
        disabled && "s-pointer-events-none s-opacity-60",
        !selected &&
          !disableHover &&
          "hover:s-bg-muted-background/60 dark:hover:s-bg-muted-background-night/60",
        className
      )}
      onClick={disabled ? undefined : onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      onFocusCapture={onFocusCapture}
      onMouseEnter={onMouseEnter}
      tabIndex={disabled ? -1 : isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? selected : undefined}
    >
      {counterValue !== undefined && (
        <Counter
          value={counterValue}
          size="sm"
          variant="ghost"
          className="s-shrink-0 s-bg-border-dark dark:s-bg-border-dark-night"
        />
      )}
      <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
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
