import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import { useUserAnswerDraft } from "@app/hooks/useUserAnswerDraft";
import type { BlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import {
  ArrowUpIcon,
  Button,
  Card,
  Counter,
  cn,
  Input,
  OptionCard,
  Spinner,
} from "@dust-tt/sparkle";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface UserAnswerRequiredProps {
  blockedAction: BlockedToolExecution & {
    status: "blocked_user_answer_required";
  };
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  conversationId: string;
  messageId: string;
}

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

export function UserAnswerRequired({
  blockedAction,
  triggeringUser,
  owner,
  conversationId,
  messageId,
}: UserAnswerRequiredProps) {
  const { user } = useAuth();
  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, isSubmitting, errorMessage } = useAnswerUserQuestion({
    owner,
  });

  const answerDraft = useUserAnswerDraft({
    multiSelect: blockedAction.question.multiSelect,
  });
  const [isSkipPending, setIsSkipPending] = useState(false);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [isCustomResponseFocused, setIsCustomResponseFocused] = useState(false);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customResponseInputRef = useRef<HTMLInputElement>(null);

  const { question } = blockedAction;
  const isTriggeredByCurrentUser = blockedAction.userId === user?.sId;

  const isCustomResponseActive =
    isCustomResponseFocused ||
    answerDraft.answerToSubmit?.customResponse !== undefined;

  const isAnswerSubmitting = isSubmitting && !isSkipPending;
  const isSkipSubmitting = isSubmitting && isSkipPending;

  // Reset the keyboard cursor and focus when a new blocked action replaces the current one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: blockedAction.actionId is an intentional reset trigger
  useEffect(() => {
    setActiveOptionIndex(0);
    setIsCustomResponseFocused(false);
    setIsKeyboardNavigating(false);
    containerRef.current?.focus({ preventScroll: true });
  }, [blockedAction.actionId]);

  // Sends either an answer or skip response, then clears the completed blocked action.
  async function submitAnswer(
    answer: UserQuestionAnswer,
    { isSkip = false }: { isSkip?: boolean } = {}
  ) {
    setIsSkipPending(isSkip);
    const result = await answerQuestion({
      conversationId,
      messageId,
      actionId: blockedAction.actionId,
      answer,
    });

    if (result.success) {
      removeCompletedAction(blockedAction.actionId);
    }

    setIsSkipPending(false);
  }

  // Moves the visual cursor to an option and leaves custom response focus.
  function activateOption(index: number) {
    setIsCustomResponseFocused(false);
    setActiveOptionIndex(index);
  }

  // Handles pointer/focus option selection; single-select answers submit immediately.
  function handleOptionClick(index: number) {
    if (isSubmitting) {
      return;
    }

    activateOption(index);

    const answer = answerDraft.selectOption(index);

    if (answer !== null) {
      void submitAnswer(answer);
    }
  }

  // Cycles the active option for keyboard navigation.
  function moveActiveOption(direction: 1 | -1) {
    if (question.options.length === 0) {
      return;
    }

    setActiveOptionIndex(
      (prev) =>
        (prev + direction + question.options.length) % question.options.length
    );
  }

  // Submits the current draft answer when one is available.
  function handleSubmit() {
    if (isSubmitting || answerDraft.answerToSubmit === null) {
      return;
    }

    void submitAnswer(answerDraft.answerToSubmit);
  }

  // Submits an empty answer to skip the question.
  function handleSkip() {
    if (isSubmitting) {
      return;
    }

    void submitAnswer({ selectedOptions: [] }, { isSkip: true });
  }

  // Applies the keyboard cursor selection to the active option.
  function handleActiveOptionSelection() {
    if (question.options.length === 0) {
      return;
    }

    handleOptionClick(activeOptionIndex);
  }

  // Starts or continues a custom response from printable container key presses.
  function handleStartCustomResponse(character: string) {
    setIsCustomResponseFocused(true);
    answerDraft.appendCustomResponse(character);
    customResponseInputRef.current?.focus();
  }

  // Handles custom-input shortcuts that move back to options or submit the answer.
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

  // Captures global shortcuts before focused option buttons can handle them.
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

  // Handles keyboard navigation when focus is on the answer card container.
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
          handleActiveOptionSelection();
        }
        break;
    }
  }

  if (!isTriggeredByCurrentUser) {
    return (
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Waiting for&nbsp;
        <span className="font-semibold">
          {triggeringUser?.fullName ?? "another user"}
        </span>
        &nbsp; to answer.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDownCapture={handleContainerKeyDownCapture}
      onKeyDown={handleContainerKeyDown}
      onMouseMove={() => setIsKeyboardNavigating(false)}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-dark bg-background p-5 outline-none",
        "dark:border-dark-night dark:bg-background-night",
        isKeyboardNavigating && "cursor-none"
      )}
    >
      <div className="text-base font-medium leading-tight text-foreground dark:text-foreground-night">
        {question.question}
      </div>
      {isAnswerSubmitting ? (
        <div className="flex min-h-64 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {question.options.map((option, index) => (
            <OptionCard
              key={index}
              label={option.label}
              description={option.description}
              counterValue={index + 1}
              selected={answerDraft.selectedOptions.includes(index)}
              disableHover={isKeyboardNavigating}
              onFocusCapture={() => activateOption(index)}
              onMouseEnter={() => activateOption(index)}
              className={cn(
                activeOptionIndex === index &&
                  !isCustomResponseActive &&
                  !answerDraft.selectedOptions.includes(index) &&
                  "bg-primary-100 dark:bg-primary-100-night",
                isKeyboardNavigating && "cursor-none"
              )}
              onClick={() => handleOptionClick(index)}
              disabled={isAnswerSubmitting}
            />
          ))}
          <Card
            variant="tertiary"
            className={cn(
              "w-full items-center gap-2 transition-colors",
              isCustomResponseActive
                ? "bg-primary-100 dark:bg-primary-100-night"
                : [
                    "bg-background dark:bg-background-night ",
                    !isKeyboardNavigating &&
                      "hover:bg-primary-100 dark:hover:bg-primary-100-night",
                  ]
            )}
          >
            <Counter
              value={question.options.length + 1}
              size="sm"
              variant="ghost"
              className="shrink-0 bg-border-darker dark:bg-border-darker-night"
            />
            <Input
              ref={customResponseInputRef}
              id={`custom-response-${blockedAction.actionId}`}
              containerClassName="flex-1"
              className={cn(
                "h-auto w-full rounded-none border-transparent bg-transparent",
                "px-0 py-0 text-sm shadow-none",
                "dark:border-transparent dark:bg-transparent",
                "focus-visible:border-transparent focus-visible:ring-0",
                "dark:focus-visible:border-transparent dark:focus-visible:ring-0",
                isKeyboardNavigating && "cursor-none"
              )}
              placeholder="Type something else"
              value={answerDraft.customResponse}
              onFocus={() => {
                setIsCustomResponseFocused(true);
                answerDraft.selectCustomResponse();
              }}
              onBlur={() => setIsCustomResponseFocused(false)}
              onChange={(e) => answerDraft.updateCustomResponse(e.target.value)}
              onKeyDown={handleCustomResponseKeyDown}
              name="custom-response"
              disabled={isSubmitting}
            />
          </Card>
        </div>
      )}
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800 dark:text-warning-800-night">
          {errorMessage}
        </div>
      )}
      <div className="flex items-center justify-between gap-3">
        <Button
          label="Skip"
          variant="outline"
          size="sm"
          onClick={handleSkip}
          isLoading={isSkipSubmitting}
        />
        <Button
          icon={ArrowUpIcon}
          variant="highlight"
          size="sm"
          isLoading={isAnswerSubmitting}
          disabled={answerDraft.answerToSubmit === null}
          onClick={handleSubmit}
          aria-label="Send answer"
        />
      </div>
    </div>
  );
}
