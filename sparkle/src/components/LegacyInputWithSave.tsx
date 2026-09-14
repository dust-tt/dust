import { Button } from "@sparkle/components/LegacyButton";
import { cn } from "@sparkle/lib/utils";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface LegacyInputWithSaveProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange"
  > {
  /** The persisted value shown at rest; the field reverts to it when an edit is abandoned. */
  value?: string | null;
  /** Right-aligned unit displayed next to the value (e.g. a currency or "%"). */
  unit?: string;
  /** Called with the draft value on save (Enter or Save click); a spinner shows until the returned promise settles. */
  onSave: (value: string) => Promise<void> | void;
  /** Sanitizes the draft on focus and on every keystroke (e.g. strip non-digits). */
  normalizeValue?: (value: string) => string;
  /** Formats the draft for display while editing (e.g. add thousands separators). */
  formatValue?: (value: string) => string;
  className?: string;
}

/**
 * Legacy text field with an optional right-aligned unit and an inline save
 * action calling `onSave`. Kept only as a visual reference for legacy product
 * surfaces.
 *
 * @deprecated Use InputWithSave instead.
 * @summary Deprecated legacy text field with inline save.
 */
export const LegacyInputWithSave = forwardRef<
  HTMLInputElement,
  LegacyInputWithSaveProps
>(
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
          "flex h-9 w-full items-center gap-1.5 rounded-xl border py-1.5 pl-3 text-sm",
          showSaveButton ? "pr-1.5" : "pr-3",
          "text-foreground",
          "bg-background",
          "border-border",
          "ring-inset ring-highlight/0",
          disabled
            ? "cursor-not-allowed"
            : cn(
                "cursor-text",
                "focus-within:border-border-focus",
                "focus-within:ring-2",
                "focus-within:ring-highlight/20"
              ),
          className
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <input
          ref={inputRef}
          className={cn(
            "h-full w-full min-w-0 flex-1 border-0 bg-transparent p-0 text-right",
            "outline-hidden focus:outline-hidden focus-visible:outline-hidden",
            "ring-0 focus:ring-0 focus-visible:ring-0 shadow-none",
            "placeholder:text-muted-foreground",
            disabled && "cursor-not-allowed text-muted-foreground"
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
        {unit && <span className="shrink-0 text-muted-foreground">{unit}</span>}
        {showSaveButton && (
          <Button
            label="Save"
            variant="highlight"
            size="xs"
            isLoading={isSaving}
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

LegacyInputWithSave.displayName = "LegacyInputWithSave";
