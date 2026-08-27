import { Button } from "@sparkle/components/Button";
import { Input } from "@sparkle/components/Input";
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
    "value" | "onChange" | "size"
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
  /** Returns an error message for an invalid draft; saving is blocked while it returns one. */
  validate?: (value: string) => string | null;
  className?: string;
}

/**
 * A text field with an optional right-aligned unit and an inline save action:
 * while editing, a Save button appears and saving (Save click or Enter) calls
 * `onSave` with a spinner until its promise resolves, while blurring or Escape
 * reverts the edit. Use it for a single value persisted on its own (a quota, a
 * price, a limit) without a surrounding form; for regular form fields use
 * Input.
 *
 * @summary Text field with inline save action.
 */
export const InputWithSave = forwardRef<HTMLInputElement, InputWithSaveProps>(
  (
    {
      value,
      unit,
      onSave,
      normalizeValue,
      formatValue,
      validate,
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
    const validationMessage = showSaveButton
      ? (validate?.(draftValue) ?? null)
      : null;

    const handleSave = async () => {
      if (isSaving || validationMessage) {
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

    const hasOverlay = Boolean(unit) || showSaveButton;

    return (
      <div className={cn("relative w-full", className)}>
        <Input
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
          message={validationMessage}
          messageStatus="error"
          className={cn(
            "text-right",
            showSaveButton ? "pr-24" : unit ? "pr-14" : null
          )}
          {...props}
        />
        {hasOverlay && (
          // Pinned to the field (h-8 at size sm) rather than the container, which
          // also holds the validation message.
          <div className="pointer-events-none absolute top-0 right-3 flex h-8 items-center gap-1.5">
            {unit && (
              <span className="shrink-0 text-sm text-faint">{unit}</span>
            )}
            {showSaveButton && (
              <Button
                label="Save"
                variant="highlight"
                size="xs"
                isLoading={isSaving}
                disabled={Boolean(validationMessage)}
                className="pointer-events-auto"
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

InputWithSave.displayName = "InputWithSave";
