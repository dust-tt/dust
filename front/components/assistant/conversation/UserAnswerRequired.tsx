import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useAnswerUserQuestion } from "@app/hooks/useAnswerUserQuestion";
import { useUserAnswerDraft } from "@app/hooks/useUserAnswerDraft";
import type { AgentLoopBlockedToolExecution } from "@app/lib/actions/mcp";
import type { UserQuestionAnswer } from "@app/lib/actions/types";
import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { useAuth } from "@app/lib/auth/AuthContext";
import type { LightWorkspaceType, UserType } from "@app/types/user";
import { ArrowUp, Button, cn, OptionCard, Spinner } from "@dust-tt/sparkle";
import { useReducedMotion } from "framer-motion";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

interface UserAnswerRequiredProps {
  blockedAction: AgentLoopBlockedToolExecution & {
    status: "blocked_user_answer_required";
  };
  triggeringUser: UserType | null;
  owner: LightWorkspaceType;
  retryHandler: () => Promise<void>;
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

export function UserAnswerRequired({
  blockedAction,
  triggeringUser,
  owner,
  retryHandler,
}: UserAnswerRequiredProps) {
  const { user } = useAuth();
  const { removeCompletedAction } = useBlockedActionsContext();
  const { answerQuestion, errorMessage } = useAnswerUserQuestion({ owner });

  const answerDraft = useUserAnswerDraft({
    multiSelect: blockedAction.question.multiSelect,
  });
  const [submission, setSubmission] = useState<SubmissionState>(null);
  const [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const [isCustomResponseFocused, setIsCustomResponseFocused] = useState(false);
  const [isKeyboardNavigating, setIsKeyboardNavigating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const customResponseInputRef = useRef<HTMLInputElement>(null);
  const shouldReduceMotion = useReducedMotion();

  const { question } = blockedAction;
  const canCurrentUserRespond = canCurrentUserRespondToParentUserMessage({
    parentUserId: blockedAction.userId,
    currentUserId: user?.sId,
  });

  const isCustomResponseActive =
    isCustomResponseFocused ||
    answerDraft.answerToSubmit?.customResponse !== undefined;

  const isSubmitting = submission !== null;

  // Reset the keyboard cursor and focus when a new blocked action replaces the current one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: blockedAction.actionId is an intentional reset trigger
  useEffect(() => {
    setActiveOptionIndex(0);
    setIsCustomResponseFocused(false);
    setIsKeyboardNavigating(false);
    containerRef.current?.focus({ preventScroll: true });
  }, [blockedAction.actionId]);

  async function submitAnswer(
    answer: UserQuestionAnswer,
    { isSkip = false }: { isSkip?: boolean } = {}
  ) {
    // Move focus out of the controls before disabling and hiding them.
    containerRef.current?.focus({ preventScroll: true });
    const submissionKind = isSkip ? "skip" : "answer";
    setSubmission({ kind: submissionKind, phase: "pending" });

    // Submit against the action's own conversation/message: for a sub-agent
    // question these are the child's ids (the action lives in the child
    // conversation). For a direct question they equal the current conversation.
    const result = await answerQuestion({
      conversationId: blockedAction.conversationId,
      messageId: blockedAction.messageId,
      actionId: blockedAction.actionId,
      answer,
    });

    if (result.success) {
      // Resume the agent run. For a sub-agent question this also relaunches the
      // blocked parent run (the child retry is a no-op once the answer is in).
      await retryHandler();

      if (shouldReduceMotion) {
        removeCompletedAction(blockedAction.actionId);
      } else {
        // Keep the submission state visible until the exit animation removes the card.
        setSubmission({ kind: submissionKind, phase: "exiting" });
      }
    } else {
      setSubmission(null);
    }
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
      void submitAnswer(answer);
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

    void submitAnswer(answerDraft.answerToSubmit);
  }

  function handleSkip() {
    if (isSubmitting) {
      return;
    }

    void submitAnswer({ selectedOptions: [] }, { isSkip: true });
  }

  function handleActiveOptionSelection() {
    if (question.options.length === 0) {
      return;
    }

    handleOptionClick(activeOptionIndex);
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
          handleActiveOptionSelection();
        }
        break;
    }
  }

  if (!canCurrentUserRespond) {
    return (
      <div className="text-sm text-muted-foreground">
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
      aria-busy={isSubmitting}
      onKeyDownCapture={handleContainerKeyDownCapture}
      onKeyDown={handleContainerKeyDown}
      onMouseMove={() => setIsKeyboardNavigating(false)}
      onAnimationEnd={(event) => {
        if (
          submission?.phase === "exiting" &&
          event.currentTarget === event.target
        ) {
          removeCompletedAction(blockedAction.actionId);
        }
      }}
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-dark bg-background p-5 outline-hidden",
        "ease-enter motion-reduce:animate-none",
        submission?.phase === "exiting" &&
          "animate-out fill-mode-forwards fade-out-0 duration-exit",
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
                // Keyboard-active highlight uses the same hover token as the
                // pointer hover, so both navigation modes read identically.
                activeOptionIndex === index &&
                  !isCustomResponseActive &&
                  !answerDraft.selectedOptions.includes(index) &&
                  "bg-hover",
                isKeyboardNavigating && "cursor-none"
              )}
              onClick={() => handleOptionClick(index)}
              disabled={isSubmitting}
            />
          ))}
          <OptionCard
            type="input"
            selected={isCustomResponseActive}
            disableHover={isKeyboardNavigating}
            className={cn(isKeyboardNavigating && "cursor-none")}
            inputRef={customResponseInputRef}
            id={`custom-response-${blockedAction.actionId}`}
            name="custom-response"
            placeholder="Tell the agent what to do differently"
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
      {errorMessage && (
        <div className="text-sm font-medium text-warning-800">
          {errorMessage}
        </div>
      )}
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
          className="rounded-full"
        />
      </div>
    </div>
  );
}
