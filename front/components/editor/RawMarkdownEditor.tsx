import { cn } from "@dust-tt/sparkle";
import { forwardRef, type UIEventHandler } from "react";

interface RawMarkdownEditorProps {
  value: string;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  onScroll?: UIEventHandler<HTMLTextAreaElement>;
}

export const RawMarkdownEditor = forwardRef<
  HTMLTextAreaElement,
  RawMarkdownEditorProps
>(function RawMarkdownEditor(
  { value, onChange, onScroll, readOnly = false, placeholder, className },
  ref
) {
  return (
    <textarea
      ref={ref}
      aria-label={placeholder ?? "Markdown source"}
      className={cn(
        "block h-full min-h-0 w-full resize-none overflow-y-auto overflow-x-hidden",
        "border-0 bg-transparent p-0 shadow-none",
        "font-mono text-sm leading-relaxed",
        "text-foreground dark:text-foreground-night",
        "focus:outline-none focus:ring-0",
        "placeholder:text-muted-foreground dark:placeholder:text-muted-foreground-night",
        className
      )}
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      onScroll={onScroll}
      readOnly={readOnly}
      placeholder={placeholder}
      spellCheck={false}
    />
  );
});

RawMarkdownEditor.displayName = "RawMarkdownEditor";
