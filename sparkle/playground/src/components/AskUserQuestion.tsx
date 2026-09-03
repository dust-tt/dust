import { ArrowUp, Button, cn, OptionCard, Spinner } from "@dust-tt/sparkle";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Mirrors front's `components/assistant/conversation/UserAnswerRequired.tsx`
 * (plus the draft logic of `hooks/useUserAnswerDraft.ts`).
 *
 * This is production's *only* approval gate: plan mode has no approval tool of
 * its own, so "Approve this plan?" is an `ask_user_question` call rendered by
 * this card. Behaviour kept from production:
 *  - single-select: clicking an option submits immediately
 *  - multi-select: clicking toggles, submit with the arrow button or Cmd+Enter
 *  - any printable key starts typing into the free-text option
 *  - ArrowUp/ArrowDown move the cursor, Enter/Space picks, Escape skips
 *  - Backspace in an empty free-text field jumps back to the last option
 */

export interface UserQuestionOption {
  label: string;
  description?: string;
}

export interface UserQuestion {
  question: string;
  options: UserQuestionOption[];
  multiSelect: boolean;
}

export interface UserQuestionAnswer {
  selectedOptions: number[];
  customResponse?: string;
}

type SubmissionState = {
  kind: "answer" | "skip";
  phase: "pending" | "exiting";
} | null;

function isPrintableKey(e: KeyboardEvent<HTMLDivElement>) {
  return (
    e.key.length === 1 && e.key !== " " && !e.altKey && !e.ctrlKey && !e.metaKey
  );
}

function isEditableTarget(target: EventTarget) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

interface AnswerDraft {
  selectedOptions: number[];
  customResponse: string;
}

function buildAnswer(draft: AnswerDraft): UserQuestionAnswer | null {
  if (draft.selectedOptions.length > 0) {
    return { selectedOptions: draft.selectedOptions };
  }

  const trimmedCustomResponse = draft.customResponse.trim();
  if (trimmedCustomResponse.length === 0) {
    return null;
  }

  return { selectedOptions: [], customResponse: trimmedCustomResponse };
}

function useUserAnswerDraft({ multiSelect }: { multiSelect: boolean }) {
  const [draft, setDraft] = useState<AnswerDraft>({
    selectedOptions: [],
    customResponse: "",
  });

  const answerToSubmit = buildAnswer(draft);

  function selectOption(index: number): UserQuestionAnswer | null {
    if (!multiSelect) {
      setDraft((current) => ({ ...current, selectedOptions: [index] }));
      return { selectedOptions: [index] };
    }

    setDraft((current) => ({
      ...current,
      selectedOptions: current.selectedOptions.includes(index)
        ? current.selectedOptions.filter((i) => i !== index)
        : [...current.selectedOptions, index],
    }));

    return null;
  }

  return {
    answerToSubmit,
    customResponse: draft.customResponse,
    selectedOptions: draft.selectedOptions,
    selectOption,
    selectCustomResponse: () =>
      setDraft((current) => ({ ...current, selectedOptions: [] })),
    updateCustomResponse: (customResponse: string) =>
      setDraft({ selectedOptions: [], customResponse }),
    appendCustomResponse: (character: string) =>
      setDraft((current) => ({
        selectedOptions: [],
        customResponse: `${current.customResponse}${character}`,
      })),
  };
}

interface AskUserQuestionProps {
  /** Stable id: resets the keyboard cursor when a new question replaces this one. */
  actionId: string;
  question: UserQuestion;
  onAnswer: (answer: UserQuestionAnswer) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
  /** Simulated round-trip before the card fades out, in ms. */
  submitDelayMs?: number;
}

export function AskUserQuestion({
  actionId,
  question,
  onAnswer,
  onSkip,
  submitDelayMs = 700,
}: AskUserQuestionProps) {
  const answerDraft = useUserAnswerDraft({
    multiSelect: question.multiSelect,
  });
  const [submission, setSubmission] = useState<SubmissionState>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [isCustomResponseFocused, setIsCustomResponseFocused] = useState(false);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customResponseInputRef = useRef<HTMLInputElement>(null);

  const isCustomResponseActive =
    isCustomResponseFocused ||
    answerDraft.answerToSubmit?.customResponse !== undefined;

  const isSubmitting = submission !== null;

  // Reset the keyboard cursor and focus when a new question replaces the current one.
  useEffect(() => {
    setActiveOptionIndex(0);
    setIsCustomResponseFocused(false);
    setIsKeyboardNavigating(false);
    containerRef.current?.focus({ preventScroll: true });
  }, [actionId]);

  function submitAnswer(
    answer: UserQuestionAnswer,
    { isSkip = false }: { isSkip?: boolean } = {}
  ) {
    // Move focus out of the controls before disabling and hiding them.
    containerRef.current?.focus({ preventScroll: true });
    const submissionKind = isSkip ? "skip" : "answer";
    setSubmission({ kind: submissionKind, phase: "pending" });

    window.setTimeout(() => {
      if (isSkip) {
        void onSkip();
      } else {
        void onAnswer(answer);
      }
    }, submitDelayMs);
  }

  function activateOption(index: number) {
    setIsCustomResponseFocused(false);
    setActiveOptionIndex(index);
  }

  function handleOptionClick(index: number) {
    if (isSubmitting) {
      return;
    }

    activateOption(index);

    const answer = answerDraft.selectOption(index);
    if (answer !== null) {
      submitAnswer(answer);
    }
  }

  function moveActiveOption(direction: 1 | -1) {
    if (question.options.length === 0) {
      return;
    }

    setActiveOptionIndex(
      (prev) =>
        (prev + direction + question.options.length) % question.options.length
    );
  }

  function handleSubmit() {
    if (isSubmitting || answerDraft.answerToSubmit === null) {
      return;
    }

    submitAnswer(answerDraft.answerToSubmit);
  }

  function handleSkip() {
    if (isSubmitting) {
      return;
    }

    submitAnswer({ selectedOptions: [] }, { isSkip: true });
  }

  function handleStartCustomResponse(character: string) {
    setIsCustomResponseFocused(true);
    answerDraft.appendCustomResponse(character);
    customResponseInputRef.current?.focus();
  }

  function handleCustomResponseKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (
      e.key === "Backspace" &&
      answerDraft.customResponse.length === 0 &&
      question.options.length > 0
    ) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      setIsCustomResponseFocused(false);
      setActiveOptionIndex(question.options.length - 1);
      containerRef.current?.focus();
      return;
    }

    if (
      e.key === "Enter" &&
      (!question.multiSelect || e.metaKey || e.ctrlKey)
    ) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      handleSubmit();
    }
  }

  function handleContainerKeyDownCapture(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setIsKeyboardNavigating(true);
      handleSkip();
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && question.multiSelect) {
      e.preventDefault();
      e.stopPropagation();
      setIsKeyboardNavigating(true);
      handleSubmit();
    }
  }

  function handleContainerKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) {
      return;
    }

    if (isPrintableKey(e)) {
      e.preventDefault();
      setIsKeyboardNavigating(true);
      handleStartCustomResponse(e.key);
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setIsKeyboardNavigating(true);
        setIsCustomResponseFocused(false);
        moveActiveOption(1);
        containerRef.current?.focus();
        break;
      case "ArrowUp":
        e.preventDefault();
        setIsKeyboardNavigating(true);
        setIsCustomResponseFocused(false);
        moveActiveOption(-1);
        containerRef.current?.focus();
        break;
      case "Enter":
      case " ":
        if (e.currentTarget === e.target) {
          e.preventDefault();
          setIsKeyboardNavigating(true);
          if (question.options.length > 0) {
            handleOptionClick(activeOptionIndex);
          }
        }
        break;
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-busy={isSubmitting}
      onKeyDownCapture={handleContainerKeyDownCapture}
      onKeyDown={handleContainerKeyDown}
      onMouseMove={() => setIsKeyboardNavigating(false)}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-dark bg-background p-5 outline-hidden",
        "ease-enter motion-reduce:animate-none",
        "animate-in fade-in-0 duration-enter",
        isKeyboardNavigating && "cursor-none"
      )}
    >
      <div className="text-base font-medium leading-tight text-foreground">
        {question.question}
      </div>
      <div className="relative min-h-16">
        <div
          aria-hidden={isSubmitting}
          className={cn(
            "flex flex-col gap-2 transition-opacity ease-enter motion-reduce:transition-none",
            isSubmitting
              ? "opacity-0 duration-exit"
              : "opacity-100 duration-enter"
          )}
        >
          {question.options.map((option, index) => (
            <OptionCard
              key={index}
              label={option.label}
              description={option.description}
              counterValue={index + 1}
              selected={answerDraft.selectedOptions.includes(index)}
              disableHover={isKeyboardNavigating}
              selectionIndicator={question.multiSelect ? "checkbox" : "radio"}
              onFocusCapture={() => activateOption(index)}
              onMouseEnter={() => activateOption(index)}
              className={cn(
                activeOptionIndex === index &&
                  !isCustomResponseActive &&
                  !answerDraft.selectedOptions.includes(index) &&
                  "bg-primary-100",
                isKeyboardNavigating && "cursor-none"
              )}
              onClick={() => handleOptionClick(index)}
              disabled={isSubmitting}
            />
          ))}
          <OptionCard
            type="input"
            // No counter on the free-text row (Figma 14800:126108); production
            // still numbers it as `options.length + 1`.
            selected={isCustomResponseActive}
            disableHover={isKeyboardNavigating}
            className={cn(isKeyboardNavigating && "cursor-none")}
            inputRef={customResponseInputRef}
            id={`custom-response-${actionId}`}
            name="custom-response"
            placeholder="Type something else"
            value={answerDraft.customResponse}
            disabled={isSubmitting}
            onFocus={() => {
              setIsCustomResponseFocused(true);
              answerDraft.selectCustomResponse();
            }}
            onBlur={() => setIsCustomResponseFocused(false)}
            onChange={(value) => answerDraft.updateCustomResponse(value)}
            onKeyDown={handleCustomResponseKeyDown}
          />
        </div>
        <div
          role={isSubmitting ? "status" : undefined}
          aria-hidden={!isSubmitting}
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity ease-enter motion-reduce:transition-none",
            isSubmitting
              ? "opacity-100 duration-exit"
              : "pointer-events-none opacity-0 duration-enter"
          )}
        >
          <Spinner size="lg" />
          <span className="sr-only">
            {submission?.kind === "skip"
              ? "Skipping question"
              : "Submitting answer"}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button
          label="Skip"
          variant="outline"
          size="sm"
          onClick={handleSkip}
          isLoading={submission?.kind === "skip"}
          disabled={isSubmitting}
        />
        <Button
          icon={ArrowUp}
          variant="highlight"
          size="sm"
          isLoading={submission?.kind === "answer"}
          disabled={isSubmitting || answerDraft.answerToSubmit === null}
          onClick={handleSubmit}
          aria-label="Send answer"
        />
      </div>
    </div>
  );
}
