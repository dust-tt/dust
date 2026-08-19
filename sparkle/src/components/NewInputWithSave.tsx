import { NewButton } from "@sparkle/components/NewButton";
import { NewInput } from "@sparkle/components/NewInput";
import { cn } from "@sparkle/lib/utils";
import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export interface NewInputWithSaveProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "size"
  > {
  value?: string | null;
  unit?: string;
  onSave: (value: string) => Promise<void> | void;
  // Cleans each keystroke before it's passed to onSave (e.g. strip non-digits).
  normalizeValue?: (value: string) => string;
  // Formats the draft for display only (e.g. thousands separators); onSave still
  // receives the normalized value.
  formatValue?: (value: string) => string;
  className?: string;
}

export const NewInputWithSave = forwardRef<
  HTMLInputElement,
  NewInputWithSaveProps
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

    // Composes <NewInput> for the field and overlays the unit + Save button on the
    // right (like SearchInput), so it can't drift from the NewInput design. The
    // input reserves right padding so its value stays clear of the overlay.
    const hasOverlay = Boolean(unit) || showSaveButton;

    return (
      <div className={cn("relative w-full", className)}>
        <NewInput
          ref={inputRef}
          size="sm"
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
          className={cn(showSaveButton ? "pr-20" : unit ? "pr-12" : null)}
          {...props}
        />
        {hasOverlay && (
          // pointer-events-none lets clicks fall through to the input (to
          // focus it); the Save button re-enables them for itself.
          <div className="pointer-events-none absolute inset-y-0 right-1 flex items-center gap-1.5">
            {unit && (
              <span className="shrink-0 text-sm text-faint">{unit}</span>
            )}
            {showSaveButton && (
              <NewButton
                label="Save"
                variant="highlight"
                size="xs"
                isLoading={isSaving}
                className="pointer-events-auto"
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
        )}
      </div>
    );
  }
);

NewInputWithSave.displayName = "NewInputWithSave";
