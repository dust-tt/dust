import { useEffect, useRef, useState } from "react";

// Text edited in place: no input chrome, a placeholder when empty, and a
// subtle background on hover and focus so it still reads as editable.
// Enter commits, Escape reverts to the value the field had when it got focus.
export function InlineText({
  value,
  placeholder,
  onChange,
  onBlur,
  className,
  placeholderClassName,
  ariaLabel,
  singleLine = true,
  invalid = false,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  /** Typography for typed text. */
  className: string;
  /** Typography when empty; the placeholder inherits the size from className. */
  placeholderClassName: string;
  ariaLabel: string;
  singleLine?: boolean;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const valueOnFocus = useRef(value);
  const [isFocused, setIsFocused] = useState(false);

  // Keep the DOM in sync when the value changes from outside (suggestions,
  // auto-fill) without fighting the caret while the user types.
  useEffect(() => {
    if (ref.current && !isFocused && ref.current.textContent !== value) {
      ref.current.textContent = value;
    }
  }, [value, isFocused]);

  const revert = () => {
    if (ref.current) {
      ref.current.textContent = valueOnFocus.current;
    }
    onChange(valueOnFocus.current);
  };

  return (
    <div
      ref={ref}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={!singleLine}
      aria-invalid={invalid || undefined}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      spellCheck={false}
      className={[
        "-mx-1 min-w-0 cursor-text rounded-lg px-1 outline-none transition-colors motion-reduce:transition-none",
        "whitespace-pre-wrap break-words",
        "hover:bg-muted-background focus:bg-muted-background",
        "empty:before:pointer-events-none empty:before:content-[attr(data-placeholder)]",
        className,
        value ? "" : placeholderClassName,
      ]
        .filter(Boolean)
        .join(" ")}
      onFocus={() => {
        valueOnFocus.current = value;
        setIsFocused(true);
      }}
      onBlur={() => {
        setIsFocused(false);
        onChange((ref.current?.textContent ?? "").trim());
        onBlur?.();
      }}
      onInput={() => onChange(ref.current?.textContent ?? "")}
      onKeyDown={(event) => {
        if (singleLine && event.key === "Enter") {
          event.preventDefault();
          ref.current?.blur();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          revert();
          ref.current?.blur();
        }
      }}
      onPaste={(event) => {
        // Plain text only: strip formatting from pasted content.
        event.preventDefault();
        const text = event.clipboardData.getData("text/plain");
        document.execCommand(
          "insertText",
          false,
          singleLine ? text.replace(/\n+/g, " ") : text
        );
      }}
    />
  );
}
