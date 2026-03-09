import { Input } from "@dust-tt/sparkle";
import { useRef, useState } from "react";

export interface AskUserQuestionOption {
  id: string;
  label: string;
}

export interface AskUserQuestionItem {
  question: string;
  options: AskUserQuestionOption[];
  allowOther?: boolean;
  /** Label for the tab when multiple questions (defaults to question text or "Question N") */
  label?: string;
}

interface AskUserQuestionProps {
  /** Single question (backward compatible) */
  question?: string;
  options?: AskUserQuestionOption[];
  allowOther?: boolean;
  /** Multiple questions: show tabs above to switch. When provided, question/options/allowOther are ignored. */
  questions?: AskUserQuestionItem[];
  onSelect: (option: AskUserQuestionOption) => void;
  className?: string;
}

/**
 * Single-click question component (Claude Code style).
 * Options are numbered rows — clicking one immediately fires onSelect.
 * "Other…" reveals an inline input that sends on Enter.
 * Multiple questions: tab strip at top to switch between them.
 */
export function AskUserQuestion({
  question: questionProp,
  options: optionsProp,
  allowOther: allowOtherProp,
  questions: questionsProp,
  onSelect,
  className,
}: AskUserQuestionProps) {
  const normalizedQuestions: AskUserQuestionItem[] =
    questionsProp && questionsProp.length > 0
      ? questionsProp
      : questionProp && optionsProp
        ? [
            {
              question: questionProp,
              options: optionsProp,
              allowOther: allowOtherProp,
            },
          ]
        : [];

  const [activeIndex, setActiveIndex] = useState(0);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherValue, setOtherValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const current = normalizedQuestions[activeIndex];
  if (!current) return null;

  const { question, options, allowOther } = current;

  const switchQuestion = (index: number) => {
    if (index !== activeIndex) {
      setActiveIndex(index);
      setShowOtherInput(false);
      setOtherValue("");
    }
  };

  const handleOtherSend = () => {
    const text = otherValue.trim();
    if (!text) return;
    onSelect({ id: "other", label: text });
    setOtherValue("");
    setShowOtherInput(false);
  };

  const hasMultipleQuestions = normalizedQuestions.length > 1;

  return (
    <div className={"s-flex s-w-full s-flex-col s-gap-2 " + (className ?? "")}>
      {hasMultipleQuestions && (
        <div className="s-flex s-flex-wrap s-gap-1 s-pb-1">
          {normalizedQuestions.map((q, index) => (
            <button
              key={index}
              type="button"
              onClick={() => switchQuestion(index)}
              className={
                "s-rounded-md s-px-2.5 s-py-1 s-text-xs s-font-medium s-transition-colors focus-visible:s-outline-none " +
                (activeIndex === index
                  ? "s-bg-highlight-100 s-text-highlight-800 dark:s-bg-highlight-100-night dark:s-text-highlight-800-night"
                  : "s-text-muted-foreground hover:s-bg-muted-background hover:s-text-foreground dark:s-text-muted-foreground-night dark:hover:s-bg-muted-background-night dark:hover:s-text-foreground-night")
              }
            >
              {q.label ?? q.question ?? `Question ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      <p className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night">
        {question}
      </p>

      <div className="s-flex s-flex-col">
        {options.map((opt, i) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onSelect(opt)}
            className="s-group s-flex s-w-full s-items-baseline s-gap-3 s-rounded-md s-px-2 s-py-1.5 s-text-left s-transition-colors hover:s-bg-muted-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring dark:hover:s-bg-muted-background-night"
          >
            <span className="s-w-4 s-shrink-0 s-text-right s-text-xs s-tabular-nums s-text-muted-foreground dark:s-text-muted-foreground-night">
              {i + 1}
            </span>
            <span className="s-text-sm s-text-foreground group-hover:s-text-foreground dark:s-text-foreground-night">
              {opt.label}
            </span>
          </button>
        ))}

        {allowOther && !showOtherInput && (
          <button
            type="button"
            onClick={() => {
              setShowOtherInput(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="s-group s-flex s-w-full s-items-baseline s-gap-3 s-rounded-md s-px-2 s-py-1.5 s-text-left s-transition-colors hover:s-bg-muted-background focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring dark:hover:s-bg-muted-background-night"
          >
            <span className="s-w-4 s-shrink-0 s-text-right s-text-xs s-tabular-nums s-text-muted-foreground dark:s-text-muted-foreground-night">
              {options.length + 1}
            </span>
            <span className="s-text-sm s-text-muted-foreground group-hover:s-text-foreground dark:s-text-muted-foreground-night dark:group-hover:s-text-foreground-night">
              Other…
            </span>
          </button>
        )}

        {allowOther && showOtherInput && (
          <div className="s-mt-1 s-px-2">
            <Input
              ref={inputRef}
              value={otherValue}
              onChange={(e) => setOtherValue(e.target.value)}
              placeholder="Type your answer and press Enter…"
              containerClassName="s-w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleOtherSend();
                if (e.key === "Escape") {
                  setShowOtherInput(false);
                  setOtherValue("");
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
