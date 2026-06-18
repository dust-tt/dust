import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib/utils";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface InputWithSaveProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange"
  > {
  value?: string | null;
  unit?: string;
  onSave: (value: string) => Promise<void> | void;
  // Applied to the draft value on each keystroke (e.g. to strip non-digit
  // characters for numeric inputs). The cleaned result is what gets passed to
  // onSave.
  normalizeValue?: (value: string) => string;
  // Applied to the normalized draft value for display during editing (e.g. to
  // insert thousand-separator commas). Does not affect what onSave receives.
  formatValue?: (value: string) => string;
  className?: string;
}

export const InputWithSave = forwardRef<HTMLInputElement, InputWithSaveProps>(
  (
    {
      value,
      unit,
      onSave,
      normalizeValue,
      formatValue,
      className,
      disabled,
      onFocus,
      onBlur,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    useImperativeHandle(ref, () => inputRef.current!);

    const [draftValue, setDraftValue] = useState("");
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const showSaveButton = isEditing || isSaving;

    const handleSave = async () => {
      if (isSaving) {
        return;
      }
      setIsSaving(true);
      try {
        await onSave(draftValue);
        setIsEditing(false);
        inputRef.current?.blur();
      } catch {
        // Stay in editing state; error handling is the caller's responsibility.
      } finally {
        setIsSaving(false);
      }
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isSaving && !isEditing) {
        const raw = value ?? "";
        setDraftValue(normalizeValue ? normalizeValue(raw) : raw);
        setIsEditing(true);
      }
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      // Revert to the value before the edit, unless a save is in flight.
      if (!isSaving) {
        setIsEditing(false);
      }
      onBlur?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      } else if (e.key === "Escape") {
        inputRef.current?.blur();
      }
      onKeyDown?.(e);
    };

    return (
      <div
        className={cn(
          "s-flex s-h-9 s-w-full s-items-center s-gap-1.5 s-rounded-xl s-border s-py-1.5 s-pl-3 s-text-sm",
          showSaveButton ? "s-pr-1.5" : "s-pr-3",
          "s-bg-background dark:s-bg-background-night",
          "s-border-border dark:s-border-border-night",
          "s-ring-inset s-ring-highlight/0 dark:s-ring-highlight-night/0",
          disabled
            ? "s-cursor-not-allowed"
            : cn(
                "s-cursor-text",
                "focus-within:s-border-border-focus dark:focus-within:s-border-border-focus-night",
                "focus-within:s-ring-2",
                "focus-within:s-ring-highlight/20 dark:focus-within:s-ring-highlight/50"
              ),
          className
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className={cn(
            "s-h-full s-w-full s-min-w-0 s-flex-1 s-border-0 s-bg-transparent s-p-0 s-text-right",
            // The container carries the focus styles (via focus-within); the
            // inner input must not render its own outline or ring.
            "s-outline-none focus:s-outline-none focus-visible:s-outline-none",
            "s-ring-0 focus:s-ring-0 focus-visible:s-ring-0 s-shadow-none",
            "dark:s-text-primary-50",
            "placeholder:s-text-muted-foreground dark:placeholder:s-text-muted-foreground-night",
            disabled &&
              "s-cursor-not-allowed s-text-muted-foreground dark:s-text-muted-foreground-night"
          )}
          data-1p-ignore
          value={
            showSaveButton
              ? formatValue
                ? formatValue(draftValue)
                : draftValue
              : (value ?? "")
          }
          onChange={(e) =>
            setDraftValue(
              normalizeValue ? normalizeValue(e.target.value) : e.target.value
            )
          }
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          readOnly={isSaving}
          {...props}
        />
        {unit && (
          <span className="s-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night">
            {unit}
          </span>
        )}
        {showSaveButton && (
          <Button
            label="Save"
            variant="highlight"
            size="xs"
            isLoading={isSaving}
            // Prevent the input from blurring (which would revert the edit)
            // before the click registers.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              void handleSave();
            }}
          />
        )}
      </div>
    );
  }
);

InputWithSave.displayName = "InputWithSave";
