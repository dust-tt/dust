import { Button, Card, cn } from "@dust-tt/sparkle";
import { useRef, useState } from "react";

export interface AskUserQuestionOption {
  id: string;
  label: string;
  description?: string;
}

interface AskUserQuestionProps {
  question: string;
  options: AskUserQuestionOption[];
  onSelect?: (option: AskUserQuestionOption) => void;
  onSkip?: () => void;
  selectedOptionId?: string;
  otherLabel?: string;
  className?: string;
}

export function AskUserQuestion({
  question,
  options,
  onSelect,
  onSkip,
  selectedOptionId,
  otherLabel = "Type something else...",
  className,
}: AskUserQuestionProps) {
  const [otherValue, setOtherValue] = useState("");
  const inputRef = useRef<HTMLDivElement>(null);

  const isLocked = selectedOptionId !== undefined;
  const isTyping = otherValue.length > 0;

  const handleOtherSend = () => {
    const text = otherValue.trim();
    if (!text || !onSelect) return;
    onSelect({ id: "other", label: text });
  };

  // Locked state: only show the selected option
  if (isLocked) {
    const selected = options.find((o) => o.id === selectedOptionId);
    return (
      <div
        className={cn(
          "s-w-full s-flex s-flex-col s-gap-3 s-rounded-t-xl s-border s-border-border s-bg-background s-p-4 dark:s-border-border-night dark:s-bg-background-night",
          className
        )}
      >
        <p className="s-text-base s-font-medium s-text-foreground dark:s-text-foreground-night">
          {question}
        </p>
        {selected && (
          <div className="s-flex s-flex-col s-gap-0.5 s-rounded s-border s-border-border s-bg-highlight-100 s-p-3 dark:s-border-border-night dark:s-bg-highlight-900">
            <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
              {selected.label}
            </span>
            {selected.description && (
              <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                {selected.description}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "s-w-full s-flex s-flex-col s-gap-3 s-rounded-t-xl s-border s-border-border s-bg-background s-p-4 dark:s-border-border-night dark:s-bg-background-night",
        className
      )}
    >
      <p className="s-text-base s-font-medium s-text-foreground dark:s-text-foreground-night">
        {question}
      </p>

      <div className="s-flex s-w-full s-flex-col s-gap-2">
        {options.map((opt, idx) => (
          <Card
            key={opt.id}
            variant="secondary"
            size="sm"
            onClick={() => onSelect?.(opt)}
            className="s-flex-col s-gap-0.5"
          >
            <div className="s-flex s-items-center s-gap-2">
              <span className="s-inline-flex s-h-5 s-w-5 s-items-center s-justify-center s-rounded s-bg-muted-background s-text-xs s-font-semibold s-text-foreground dark:s-bg-muted-background-night dark:s-text-foreground-night">
                {String.fromCharCode(65 + idx)}
              </span>
              <span className="s-text-sm s-font-semibold s-text-foreground dark:s-text-foreground-night">
                {opt.label}
              </span>
            </div>
            {opt.description && (
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                {opt.description}
              </span>
            )}
          </Card>
        ))}

        {/* "Type something else..." — a contentEditable card acting as inline input */}
        <div
          className="s-flex s-w-full s-cursor-text s-overflow-hidden s-rounded-xl s-border s-border-border s-bg-background s-p-3 s-text-sm s-outline-none focus-within:s-border-highlight-300 focus-within:s-ring-2 focus-within:s-ring-highlight-200/70 dark:s-border-border-night dark:s-bg-background-night dark:focus-within:s-border-highlight-300-night dark:focus-within:s-ring-highlight-300/60"
          onClick={() => inputRef.current?.focus()}
        >
          <div
            ref={inputRef}
            contentEditable
            suppressContentEditableWarning
            className="s-w-full s-outline-none empty:before:s-text-muted-foreground empty:before:s-content-[attr(data-placeholder)] dark:empty:before:s-text-muted-foreground-night"
            data-placeholder={otherLabel}
            onInput={(e) =>
              setOtherValue(
                (e.currentTarget as HTMLDivElement).textContent ?? ""
              )
            }
            onPaste={(e) => {
              e.preventDefault();
              const text = e.clipboardData.getData("text/plain");
              document.execCommand("insertText", false, text);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleOtherSend();
              }
            }}
          />
        </div>
      </div>

      <div className="s-flex s-items-center s-justify-between">
        <div>
          {onSkip && (
            <Button variant="outline" size="sm" label="Skip" onClick={onSkip} />
          )}
        </div>
        {isTyping && (
          <Button
            variant="highlight"
            size="sm"
            label="Submit"
            onClick={handleOtherSend}
          />
        )}
      </div>
    </div>
  );
}
