import { cn } from "@dust-tt/sparkle";
import React from "react";

interface ItemRowProps {
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  children: React.ReactNode;
}

export const ItemRow = React.forwardRef<HTMLDivElement, ItemRowProps>(
  function ItemRow({ isSelected, onClick, onMouseEnter, children }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors duration-100",
          "text-foreground dark:text-foreground-night",
          isSelected
            ? "bg-primary-100 dark:bg-primary-100-night"
            : "hover:bg-muted-background dark:hover:bg-muted-background-night"
        )}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
      >
        {children}
      </div>
    );
  }
);

interface ItemTitleProps {
  children: React.ReactNode;
}

export function ItemTitle({ children }: ItemTitleProps) {
  return (
    <div className="px-3 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:text-muted-foreground-night">
      {children}
    </div>
  );
}

interface ItemEmptyStateProps {
  children: React.ReactNode;
}

export function ItemEmptyState({ children }: ItemEmptyStateProps) {
  return (
    <div className="px-3 py-8 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
      {children}
    </div>
  );
}

interface KeyboardHint {
  keys: string[];
  label: string;
  textSize?: "text-xs" | "text-sm" | "text-base";
}

export function KeyboardHints({ hints }: { hints: KeyboardHint[] }) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-4 border-t px-4 py-2",
        "border-separator dark:border-separator-night",
        "text-xs text-muted-foreground dark:text-muted-foreground-night"
      )}
    >
      {hints.map((hint) => (
        <div key={hint.label} className="flex items-center gap-1.5">
          {hint.keys.map((key) => (
            <kbd
              key={key}
              className={cn(
                "inline-flex h-6 min-w-6 items-center justify-center rounded border px-1",
                "border-separator dark:border-separator-night",
                hint.textSize ?? "text-xs"
              )}
            >
              {key}
            </kbd>
          ))}
          <span>{hint.label}</span>
        </div>
      ))}
    </div>
  );
}
