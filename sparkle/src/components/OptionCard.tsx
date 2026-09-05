import { Card } from "@sparkle/components/Card";
import {
  checkboxIconStyles,
  checkboxIndicatorStyles,
  checkboxStyles,
} from "@sparkle/components/Checkbox";
import { Counter } from "@sparkle/components/Counter";
import {
  radioIndicatorStyles,
  radioStyles,
} from "@sparkle/components/RadioGroup";
import { Check } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React from "react";

/** Visual selection indicator: `radio` for single-select lists, `checkbox` for multi-select lists. */
export type OptionCardSelectionIndicator = "radio" | "checkbox";

interface OptionCardSharedProps {
  /** Badge conveying ordering or quantity, shown at the start of the card; hidden when undefined. */
  counterValue?: number;
  /** Whether the card reflects the current choice (applies selected styling and `aria-pressed`). */
  selected?: boolean;
  disabled?: boolean;
  /** Suppress the hover background on unselected cards. */
  disableHover?: boolean;
  className?: string;
  onFocusCapture?: React.FocusEventHandler<HTMLDivElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
}

interface OptionCardOptionProps extends OptionCardSharedProps {
  /** Standard choice card showing a label and optional description (the default). */
  type?: "option";
  label: string;
  description?: string | null;
  /** Trailing radio or checkbox visual making the selection mode unambiguous. */
  selectionIndicator?: OptionCardSelectionIndicator;
  /** Called when the card is clicked or activated with Enter/Space; without it the card is display-only. */
  onClick?: () => void;
}

interface OptionCardInputProps extends OptionCardSharedProps {
  // Input state: a free-text "type something else" option. The field is
  // rendered and styled by OptionCard (borderless, faint placeholder); the
  // card keeps the same chrome and counter.
  type: "input";
  value: string;
  /** Called with the new text value on every change. */
  onChange: (value: string) => void;
  placeholder?: string;
  // Accessible name for the field (screen readers). Falls back to the
  // placeholder so the input is never unlabeled.
  ariaLabel?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  name?: string;
  id?: string;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
}

export type OptionCardProps = OptionCardOptionProps | OptionCardInputProps;

/**
 * A selectable card representing one choice the user can pick in response to
 * an agent prompt, with a label, optional description, counter badge, and an
 * optional radio/checkbox selection indicator; `type="input"` turns it into a
 * free-text "type something else" option. Use it to present a small set of
 * options the user selects before the agent continues; for one-tap suggested
 * prompts that send immediately, use QuickReplyBlock instead.
 * @summary Selectable option card for agent prompts.
 */
export function OptionCard(props: OptionCardProps) {
  const {
    counterValue,
    selected = false,
    disabled = false,
    disableHover = false,
    className,
    onFocusCapture,
    onMouseEnter,
  } = props;

  const isInput = props.type === "input";
  const onClick = isInput ? undefined : props.onClick;
  const selectionIndicator = isInput ? undefined : props.selectionIndicator;
  const isInteractive = onClick !== undefined && !disabled;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Enter" || e.key === " ") && onClick) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      variant="tertiary"
      size="sm"
      className={cn(
        "w-full items-center gap-2 text-left transition-colors",
        isInteractive && "cursor-pointer",
        // In input mode `disabled` targets the field, not the card chrome.
        !isInput && disabled && "pointer-events-none opacity-60",
        // Same hover/selected tints as sidebar and menu items: the translucent
        // hover/selected tokens composite over any surface and flip with the
        // theme. A selected card gets no extra tint on hover.
        selected && "bg-selected hover:bg-selected",
        !selected && !disableHover && "hover:bg-hover",
        className
      )}
      onClick={disabled ? undefined : onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
      onFocusCapture={onFocusCapture}
      onMouseEnter={onMouseEnter}
      tabIndex={
        isInput ? undefined : disabled ? -1 : isInteractive ? 0 : undefined
      }
      aria-pressed={isInteractive ? selected : undefined}
    >
      {counterValue !== undefined && (
        <Counter
          value={counterValue}
          size="xs"
          variant="outline"
          className="shrink-0"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {props.type === "input" ? (
          <input
            ref={props.inputRef}
            type="text"
            id={props.id}
            name={props.name}
            value={props.value}
            placeholder={props.placeholder}
            aria-label={props.ariaLabel ?? props.placeholder}
            disabled={disabled}
            onChange={(e) => props.onChange(e.target.value)}
            onFocus={props.onFocus}
            onBlur={props.onBlur}
            onKeyDown={props.onKeyDown}
            className={cn(
              "w-full border-0 bg-transparent p-0 shadow-none outline-none",
              // No blue focus ring on the field; focus is shown by the card's
              // greyscale border (focus-within) instead.
              "focus:ring-0 focus-visible:ring-0 focus-visible:outline-none",
              "copy-sm text-foreground placeholder:text-faint",
              "disabled:cursor-not-allowed"
            )}
          />
        ) : (
          <>
            <span className="text-sm font-medium tracking-[-0.28px] text-foreground">
              {props.label}
            </span>
            {props.description && (
              <span className="text-xs text-muted-foreground">
                {props.description}
              </span>
            )}
          </>
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
        <div
          aria-hidden="true"
          data-state={selected ? "checked" : "unchecked"}
          className={cn(checkboxStyles(), "pointer-events-none shrink-0")}
        >
          <div
            data-state={selected ? "checked" : "unchecked"}
            className={checkboxIndicatorStyles()}
          >
            <Check className={checkboxIconStyles({ state: "checked" })} />
          </div>
        </div>
      )}
    </Card>
  );
}
