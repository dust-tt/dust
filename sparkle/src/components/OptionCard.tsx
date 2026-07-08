import { Card, type CardVariantType } from "@sparkle/components/Card";
import { Checkbox } from "@sparkle/components/Checkbox";
import { Counter } from "@sparkle/components/Counter";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export type OptionCardSelectionIndicator = "radio" | "checkbox";

export interface OptionCardProps {
  label: string;
  description?: string | null;
  counterValue?: number;
  selected?: boolean;
  disabled?: boolean;
  disableHover?: boolean;
  className?: string;
  selectionIndicator?: OptionCardSelectionIndicator;
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
  selectionIndicator,
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
        "w-full items-center gap-2 rounded-2xl text-left transition-colors",
        !disabled && "cursor-pointer",
        disabled && "pointer-events-none opacity-60",
        !selected && !disableHover && "hover:bg-muted-background/60",
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
          className="shrink-0 bg-border-dark"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {selectionIndicator === "radio" && (
        <div
          aria-hidden="true"
          className={cn(radioStyles(), "pointer-events-none shrink-0")}
        >
          {selected && <div className={radioIndicatorStyles()} />}
        </div>
      )}
      {selectionIndicator === "checkbox" && (
        <Checkbox
          aria-hidden="true"
          checked={selected}
          disabled={disabled}
          tabIndex={-1}
          className="pointer-events-none shrink-0"
          onCheckedChange={() => {}}
        />
      )}
    </Card>
  );
}
